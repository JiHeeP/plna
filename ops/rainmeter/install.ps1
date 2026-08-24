# PLNA 바탕화면 위젯 설치 (Windows PowerShell)
#
# 하는 일:
#   1. Rainmeter가 실제로 쓰는 스킨 폴더를 알아낸다 (OneDrive 리디렉션 대응)
#   2. 거기에 PLNA 폴더를 만들고 PLNA.ini 를 내려받는다
#   3. 토큰을 넣고 ASCII로 저장한다 (메모장이 .txt 로 저장하는 사고 방지)
#   4. 결과를 출력하고 폴더를 열어 준다
#
# 사용법: 아래 $token 값을 본인 것으로 바꾼 뒤 PowerShell에 전체를 붙여넣는다.

$token = 'YOUR_WIDGET_TOKEN'

$ErrorActionPreference = 'Stop'

# --- 1. Rainmeter가 설정에 기록해 둔 스킨 폴더를 우선 사용한다 -------------
$skinRoot = $null
$rainmeterIni = Join-Path $env:APPDATA 'Rainmeter\Rainmeter.ini'
if (Test-Path $rainmeterIni) {
    $match = Select-String -Path $rainmeterIni -Pattern '^\s*SkinPath\s*=\s*(.+?)\s*$' | Select-Object -First 1
    if ($match) { $skinRoot = $match.Matches[0].Groups[1].Value }
}
if (-not $skinRoot) {
    $skinRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Rainmeter\Skins'
}

$skinDir  = Join-Path $skinRoot 'PLNA'
$skinFile = Join-Path $skinDir  'PLNA.ini'

# --- 2~3. 내려받고 토큰을 넣어 저장 ---------------------------------------
New-Item -ItemType Directory -Force -Path $skinDir | Out-Null
Invoke-WebRequest -UseBasicParsing 'https://plna.vercel.app/plna-widget.ini' -OutFile $skinFile
(Get-Content -LiteralPath $skinFile -Raw) -replace 'YOUR_WIDGET_TOKEN', $token |
    Set-Content -LiteralPath $skinFile -Encoding ASCII

# --- 4. 결과 확인 ----------------------------------------------------------
Write-Host ''
Write-Host '=== 설치 결과 ===' -ForegroundColor Cyan
Write-Host "스킨 폴더 : $skinRoot"
Write-Host "파일 경로 : $skinFile"
Write-Host "파일 존재 : $(Test-Path -LiteralPath $skinFile)"
if ($token -eq 'YOUR_WIDGET_TOKEN') {
    Write-Host '경고: $token 을 실제 값으로 바꾸지 않았습니다.' -ForegroundColor Red
} else {
    $written = Select-String -LiteralPath $skinFile -Pattern '^Token=' | Select-Object -First 1
    Write-Host "토큰 반영 : $($written.Line.Substring(0, [Math]::Min(20, $written.Line.Length)))..."
}
Write-Host ''
Write-Host '다음: 작업표시줄의 Rainmeter 아이콘 우클릭 -> 새로 고침 전체' -ForegroundColor Yellow
Write-Host '     -> 우클릭 -> 스킨 -> PLNA -> PLNA.ini' -ForegroundColor Yellow

explorer $skinDir
