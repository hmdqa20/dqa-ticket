[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$today = Get-Date -Format "yyyyMMdd"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Get-ChildItem *.html | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    $newContent = $content -replace '(js/[\w.]+\.js)\?v=\d{8}', "`$1?v=$today"
    [System.IO.File]::WriteAllText($_.FullName, $newContent, $utf8NoBom)
}
Write-Host "버전 쿼리를 ?v=$today 로 일괄 갱신했습니다."