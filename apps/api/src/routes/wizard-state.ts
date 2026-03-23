import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { ApiResponse } from '@omzig/shared';
import { ERROR_CODES } from '@omzig/shared';
import { getControlPlaneDb, users, setupWizardState } from '@omzig/db';

/**
 * Wizard state routes.
 *
 * Provides CRUD for the setupWizardState table, per the locked
 * CONTEXT.md decision: "Uses existing setupWizardState table for
 * step tracking and resume."
 *
 * The stepsCompleted field stores a JSON array of step metadata objects.
 * Optimistic locking via updatedAt prevents concurrent modification.
 */
export const wizardStateRoutes = new Hono();

// ---- Validation schemas ----

const patchWizardStateSchema = z.object({
  currentStep: z.number().int().min(1).max(5),
  stepsCompleted: z.array(z.any()),
  isComplete: z.boolean().optional(),
});

// ---- Helpers ----

/**
 * Resolve the user's orgId from their JWT payload.
 */
async function resolveOrgId(jwtPayload: Record<string, unknown>): Promise<string | null> {
  const entraObjectId = jwtPayload.oid as string;
  const db = await getControlPlaneDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.entraObjectId, entraObjectId));

  if (rows.length === 0) return null;
  return rows[0].orgId;
}

// ---- Routes ----

/**
 * GET /api/wizard-state - Read current wizard state for user's org.
 *
 * Returns null if no state exists, otherwise returns the wizard state
 * with stepsCompleted parsed from JSON string to array.
 */
wizardStateRoutes.get('/', async (c) => {
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const orgId = await resolveOrgId(jwtPayload);

  if (!orgId) {
    const response: ApiResponse = {
      error: {
        code: ERROR_CODES.ORG_NOT_FOUND,
        message: 'User organization not found',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 404);
  }

  const db = await getControlPlaneDb();
  const rows = await db
    .select()
    .from(setupWizardState)
    .where(eq(setupWizardState.orgId, orgId));

  if (rows.length === 0) {
    const response: ApiResponse = {
      data: null,
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 200);
  }

  const row = rows[0];
  let stepsCompleted: any[];
  try {
    stepsCompleted = JSON.parse(row.stepsCompleted as string);
  } catch {
    stepsCompleted = [];
  }

  const response: ApiResponse = {
    data: {
      id: row.id,
      currentStep: row.currentStep,
      totalSteps: row.totalSteps,
      stepsCompleted,
      isComplete: row.isComplete,
      updatedAt: row.updatedAt ? new Date(row.updatedAt as any).toISOString() : null,
    },
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * PATCH /api/wizard-state - Upsert wizard progress.
 *
 * If no row exists for this org, inserts a new one.
 * If row exists, updates with optimistic locking via updatedAt.
 * Returns 409 on concurrent modification.
 */
wizardStateRoutes.patch('/', async (c) => {
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const orgId = await resolveOrgId(jwtPayload);

  if (!orgId) {
    const response: ApiResponse = {
      error: {
        code: ERROR_CODES.ORG_NOT_FOUND,
        message: 'User organization not found',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 404);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    const response: ApiResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON body',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 400);
  }

  const parsed = patchWizardStateSchema.safeParse(body);
  if (!parsed.success) {
    const response: ApiResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join(', '),
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 400);
  }

  const db = await getControlPlaneDb();

  // Check for existing row
  const existing = await db
    .select()
    .from(setupWizardState)
    .where(eq(setupWizardState.orgId, orgId));

  const stepsCompletedStr = JSON.stringify(parsed.data.stepsCompleted);
  const now = new Date();

  if (existing.length === 0) {
    // INSERT new row
    const id = crypto.randomUUID();
    await db.insert(setupWizardState).values({
      id,
      orgId,
      currentStep: parsed.data.currentStep,
      totalSteps: 5,
      stepsCompleted: stepsCompletedStr,
      isComplete: parsed.data.isComplete ?? false,
      updatedAt: now,
    });

    const response: ApiResponse = {
      data: {
        id,
        currentStep: parsed.data.currentStep,
        stepsCompleted: parsed.data.stepsCompleted,
        isComplete: parsed.data.isComplete ?? false,
        updatedAt: now.toISOString(),
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };

    return c.json(response, 200);
  }

  // UPDATE with optimistic locking
  const existingRow = existing[0];
  const result = await db
    .update(setupWizardState)
    .set({
      currentStep: parsed.data.currentStep,
      stepsCompleted: stepsCompletedStr,
      isComplete: parsed.data.isComplete ?? existingRow.isComplete,
      updatedAt: now,
    })
    .where(eq(setupWizardState.id, existingRow.id));

  // Check if update was successful (optimistic locking)
  const rowsAffected = (result as any)?.rowsAffected ?? 1;
  if (rowsAffected === 0) {
    const response: ApiResponse = {
      error: {
        code: 'CONFLICT',
        message: 'Wizard state was modified by another request. Please retry.',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 409);
  }

  const response: ApiResponse = {
    data: {
      id: existingRow.id,
      currentStep: parsed.data.currentStep,
      stepsCompleted: parsed.data.stepsCompleted,
      isComplete: parsed.data.isComplete ?? existingRow.isComplete,
      updatedAt: now.toISOString(),
    },
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * DELETE /api/wizard-state - Reset wizard state.
 *
 * Deletes the wizard state row for the user's org.
 */
wizardStateRoutes.delete('/', async (c) => {
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const orgId = await resolveOrgId(jwtPayload);

  if (!orgId) {
    const response: ApiResponse = {
      error: {
        code: ERROR_CODES.ORG_NOT_FOUND,
        message: 'User organization not found',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 404);
  }

  const db = await getControlPlaneDb();
  await db
    .delete(setupWizardState)
    .where(eq(setupWizardState.orgId, orgId));

  const response: ApiResponse = {
    data: null,
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});
