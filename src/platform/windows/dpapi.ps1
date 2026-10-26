# This file runs as an encoded command. The key-store code puts "$Action" in front of this text.
# An encoded command is not a script file, so the execution policy does not apply to it.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Action -ne 'protect' -and $Action -ne 'unprotect') {
    [Console]::Error.WriteLine('The action is not valid.')
    exit 5
}

# The key comes through stdin. It never goes in a command line argument.
Add-Type -AssemblyName System.Security

$inputText = [Console]::In.ReadToEnd()
$inputText = $inputText.Trim()
if ([string]::IsNullOrWhiteSpace($inputText)) {
    [Console]::Error.WriteLine('No input. Send base64 text through stdin.')
    exit 2
}

try {
    $bytes = [Convert]::FromBase64String($inputText)
} catch {
    [Console]::Error.WriteLine('The input is not valid base64.')
    exit 3
}

try {
    if ($Action -eq 'protect') {
        $result = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
    } else {
        $result = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
    }
} catch {
    [Console]::Error.WriteLine('DPAPI failed. The data belongs to another user or it is damaged.')
    exit 4
}

[Console]::Out.Write([Convert]::ToBase64String($result))
exit 0
