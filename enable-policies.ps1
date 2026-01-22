$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
$body = "C:\Users\FrankDiaz\omzig-m365-zero-trust\enable-body.json"

$policies = @(
    @{ id = "ceee8f43-f375-4292-9db5-be02c37ba352"; name = "CA001-Block-Legacy-Auth" },
    @{ id = "684e777c-d542-43ac-9c92-3d42274423c6"; name = "CA002-Require-MFA-All-Users" },
    @{ id = "022da8c4-4605-40aa-803c-aa8b6d7da908"; name = "CA003-Require-MFA-Admins" },
    @{ id = "d1751d2e-32c4-49e1-a237-ded7bec68f00"; name = "CA004-Require-Compliant-Device" },
    @{ id = "a5d48748-1ddc-4459-a1ae-836edb228e45"; name = "CA005-Block-High-Risk-Users" },
    @{ id = "b1d4b527-e3d6-45db-a44a-505f72dcde7c"; name = "CA006-MFA-Risky-SignIn" }
)

foreach ($policy in $policies) {
    Write-Host "Enabling $($policy.name)..." -NoNewline
    $url = "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/$($policy.id)"
    & $az rest --method PATCH --url $url --body "@$body" -o none 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
    }
}

Write-Host "`nAll policies processed."
