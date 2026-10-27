[CmdletBinding()]
param(
    [switch]$CheckOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$MinimumNodeVersion = [version]'24.0.0'
$DataFolderName = 'llm-gauntlet'

function Test-CommandExists {
    param([string]$Command)

    return $null -ne (Get-Command -Name $Command -ErrorAction SilentlyContinue)
}

function Get-ToolVersion {
    param([string]$Command)

    try {
        $output = & $Command --version 2>$null
        $firstLine = @($output)[0]
        if ($null -eq $firstLine) {
            return 'unknown'
        }

        return $firstLine.Trim()
    } catch {
        return 'unknown'
    }
}

function Get-NodeVersion {
    $text = (& node --version).Trim()
    if ($text -match '^v(\d+)\.(\d+)\.(\d+)') {
        return [version]("{0}.{1}.{2}" -f $Matches[1], $Matches[2], $Matches[3])
    }

    return $null
}

function Test-NodeVersion {
    $version = Get-NodeVersion
    if ($null -eq $version) {
        Write-Host 'Node.js: the version cannot be read.'
        return $false
    }

    if ($version -lt $MinimumNodeVersion) {
        Write-Host ("Node.js: version {0} is too old. Version {1} or newer is required." -f $version, $MinimumNodeVersion)
        return $false
    }

    return $true
}

function Get-DataFolder {
    $localAppData = $env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($localAppData)) {
        $localAppData = Join-Path (Join-Path $HOME 'AppData') 'Local'
    }

    return Join-Path $localAppData $DataFolderName
}

function Invoke-Native {
    param(
        [string]$Program,
        [string[]]$Arguments
    )

    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program exited with code $LASTEXITCODE."
    }
}

$tools = @(
    [pscustomobject]@{ Name = 'Node.js'; Command = 'node'; Winget = 'OpenJS.NodeJS.LTS' },
    [pscustomobject]@{ Name = 'npm'; Command = 'npm'; Winget = 'OpenJS.NodeJS.LTS' },
    [pscustomobject]@{ Name = 'Git'; Command = 'git'; Winget = 'Git.Git' }
)

$dataFolder = Get-DataFolder

Write-Host 'llm-gauntlet setup'
Write-Host ''

$missingTools = @()
foreach ($tool in $tools) {
    if (Test-CommandExists -Command $tool.Command) {
        $version = Get-ToolVersion -Command $tool.Command
        Write-Host ("{0}: {1}" -f $tool.Name, $version)
    } else {
        Write-Host ("{0}: missing" -f $tool.Name)
        $missingTools += $tool
    }
}

Write-Host ("Data folder: {0}" -f $dataFolder)

if ($CheckOnly) {
    $nodeIsValid = (Test-CommandExists -Command 'node') -and (Test-NodeVersion)
    if ($missingTools.Count -gt 0 -or -not $nodeIsValid) {
        Write-Host 'Check failed. No change was made.'
        exit 1
    }

    Write-Host 'Check passed. No change was made.'
    exit 0
}

try {
    if ($missingTools.Count -gt 0) {
        foreach ($tool in $missingTools) {
            $wingetCommand = "winget install --id $($tool.Winget) -e"
            Write-Host ("{0} is missing." -f $tool.Name)
            Write-Host ("Run this command: {0}" -f $wingetCommand)

            $answer = Read-Host 'Run this command now? (y/N)'
            if ($answer -notmatch '^(y|yes)$') {
                throw ("{0} is required. Install it and run setup again." -f $tool.Name)
            }

            if (-not (Test-CommandExists -Command 'winget')) {
                throw 'winget is not available. Install the tool yourself and run setup again.'
            }

            Invoke-Native -Program 'winget' -Arguments @('install', '--id', $tool.Winget, '-e', '--accept-package-agreements', '--accept-source-agreements')

            if (-not (Test-CommandExists -Command $tool.Command)) {
                throw ("{0} is still missing. Open a new PowerShell window and run setup again." -f $tool.Name)
            }
        }
    }

    if (-not (Test-NodeVersion)) {
        throw ("Node.js version {0} or newer is required. Run: winget upgrade --id OpenJS.NodeJS.LTS -e" -f $MinimumNodeVersion)
    }

    Push-Location $PSScriptRoot
    try {
        Write-Host ''
        Write-Host 'Installing the dependencies.'
        Invoke-Native -Program 'npm.cmd' -Arguments @('ci')

        Write-Host 'Building the application.'
        Invoke-Native -Program 'npm.cmd' -Arguments @('run', 'build')

        # Edge is tried first. Chromium is the fallback, so only Chromium is downloaded.
        Write-Host 'Installing the Chromium browser for the fallback.'
        Invoke-Native -Program 'npx.cmd' -Arguments @('patchright', 'install', 'chromium')

        Write-Host ''
        Write-Host 'The gauntlet command needs a global npm link, which changes your global npm folder.'
        # Without a terminal there is nobody to ask, so the answer is no.
        try {
            $linkAnswer = Read-Host 'Create the global link now? (y/N)'
        } catch {
            $linkAnswer = ''
        }
        if ($linkAnswer -match '^(y|yes)$') {
            Invoke-Native -Program 'npm.cmd' -Arguments @('link')
            Write-Host 'The gauntlet command is linked.'
        } else {
            Write-Host "Skipped. Run 'npm link' in the repository later to get the gauntlet command."
        }

        Write-Host 'Creating the data folder.'
        $dataFolders = @(
            $dataFolder,
            (Join-Path $dataFolder 'sessions'),
            (Join-Path $dataFolder 'keys'),
            (Join-Path $dataFolder 'logs')
        )

        foreach ($folder in $dataFolders) {
            if (-not (Test-Path -LiteralPath $folder)) {
                New-Item -ItemType Directory -Path $folder -Force | Out-Null
            }
        }

        Write-Host ''
        Write-Host 'Setup is complete.'
        Write-Host 'Next: gauntlet login claude'
        Write-Host 'Then: gauntlet'
        exit 0
    } finally {
        Pop-Location
    }
} catch {
    Write-Host ("Setup failed: {0}" -f $_.Exception.Message)
    exit 1
}