# Mind by Api D'Uniam Enterprises - instalador y reparador.
# Windows PowerShell 5.1 o superior. Solo ASCII a proposito: se ejecuta tal cual llega por la red.
#
#   irm https://byaldodaniel.github.io/Mind/instalar.ps1 | iex
#
# Instala Mind en el Escritorio (carpeta "Mind"). Si ya hay un Mind, lo actualiza o lo repara
# conservando Memoria y piezas propias. Variables opcionales: MIND_DESTINO, MIND_SIN_PREGUNTAS.

function Install-Mind {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

    $base = if ($env:MIND_BASE) { $env:MIND_BASE.TrimEnd('/') } else { 'https://byaldodaniel.github.io/Mind/estable' }
    $destino = if ($env:MIND_DESTINO) { $env:MIND_DESTINO.Trim() } else { Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mind' }
    $destino = [IO.Path]::GetFullPath($destino).TrimEnd('\')
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('mind-instalacion-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    $creada = $false
    $sinUtf8 = New-Object Text.UTF8Encoding $false

    function Ejecutar-Mind($mind, $pedido) {
        $archivo = Join-Path $tmp ('pedido-' + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.json')
        [IO.File]::WriteAllText($archivo, ($pedido | ConvertTo-Json -Compress), $sinUtf8)
        $env:MIND_PEDIDO = $archivo
        $previo = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try { $salida = (& $mind 2>&1 | Out-String); $codigo = $LASTEXITCODE } finally { $ErrorActionPreference = $previo; Remove-Item Env:MIND_PEDIDO -ErrorAction SilentlyContinue }
        if ($codigo -ne 0) { throw ('Mind respondio con un error: ' + $salida.Trim()) }
        return $salida
    }

    Write-Host ''
    Write-Host '  M I N D' -ForegroundColor White
    Write-Host '  Tu segundo cerebro.' -ForegroundColor Gray
    Write-Host "  by Api D'Uniam Enterprises" -ForegroundColor DarkGray
    Write-Host ''

    try {
        $existe = Test-Path -LiteralPath $destino
        $esMind = $existe -and ((Test-Path -LiteralPath (Join-Path $destino 'Motor\version.json')) -or (Test-Path -LiteralPath (Join-Path $destino 'Mind.cmd')))
        if ($existe -and -not $esMind -and (Get-ChildItem -LiteralPath $destino -Force | Select-Object -First 1)) {
            throw "La carpeta $destino ya existe y no es un Mind. Elige otra: `$env:MIND_DESTINO = 'C:\ruta\Mind'; y repite el comando."
        }

        New-Item -ItemType Directory -Path $tmp | Out-Null
        $web = New-Object Net.WebClient
        $web.Encoding = [Text.Encoding]::UTF8

        Write-Host '  Buscando la version mas reciente...' -ForegroundColor DarkGray
        $sobre = $web.DownloadString("$base/canal.json") | ConvertFrom-Json
        $pub = $sobre.contenido | ConvertFrom-Json
        if ($pub.paquete.url -notmatch '^[A-Za-z0-9._-]+\.zip$' -or $pub.paquete.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'El descriptor de la version no es valido; no se instalo nada.' }
        if ($pub.vence -and (([datetime]$pub.vence).ToUniversalTime() -lt [datetime]::UtcNow)) { throw 'La publicacion oficial vencio. Avisa a Api D''Uniam Enterprises; no se instalo nada.' }

        Write-Host ('  [1/3] Descargando Mind ' + $pub.motor + ' | ' + [math]::Round($pub.paquete.bytes / 1MB) + ' MB') -ForegroundColor Gray
        $zip = Join-Path $tmp $pub.paquete.url
        $web.DownloadFile("$base/$($pub.paquete.url)", $zip)
        $huella = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower()
        if ((Get-Item -LiteralPath $zip).Length -ne [int64]$pub.paquete.bytes -or $huella -ne $pub.paquete.sha256) { throw 'La descarga no coincide con la version publicada; no se instalo nada.' }

        Add-Type -AssemblyName System.IO.Compression.FileSystem
        if ($esMind) {
            $oficial = Join-Path $tmp 'oficial'
            [IO.Compression.ZipFile]::ExtractToDirectory($zip, $oficial)
            $instalada = ''
            try { $instalada = (Get-Content -LiteralPath (Join-Path $destino 'Motor\version.json') -Raw | ConvertFrom-Json).motor } catch {}
            $operacion = if ($instalada -eq $pub.motor) { 'reparar-local' } else { 'actualizar-local' }
            $mensaje = if ($operacion -eq 'reparar-local') { 'Revisando tu Mind actual...' } else { 'Actualizando tu Mind...' }
            Write-Host ('  [2/3] ' + $mensaje) -ForegroundColor Gray
            $null = Ejecutar-Mind (Join-Path $oficial 'Mind.cmd') @{ operacion = $operacion; destino = $destino }
            $hecho = if ($operacion -eq 'reparar-local') { 'reparado' } else { 'actualizado' }
        } else {
            $creada = -not $existe
            Write-Host '  [2/3] Preparando tu Mind...' -ForegroundColor Gray
            [IO.Compression.ZipFile]::ExtractToDirectory($zip, $destino)
            $hecho = 'instalado'
        }

        # Un ZIP no guarda carpetas vacias: se crean las que nombran Bienvenida y Funciones.
        foreach ($c in 'Motor\Capacidades\Base', 'Motor\Capacidades\Del usuario', 'Motor\Funciones\Del usuario') { New-Item -ItemType Directory -Force -Path (Join-Path $destino $c) | Out-Null }

        Write-Host '  [3/3] Comprobando que todo este listo...' -ForegroundColor Gray
        $revision = Ejecutar-Mind (Join-Path $destino 'Mind.cmd') @{ operacion = 'revisar' }
        $r = $revision | ConvertFrom-Json
        if ($r.problemasTotal -gt 0) { throw ('Quedaron ' + $r.problemasTotal + ' archivos distintos al manifiesto oficial.') }

        Write-Host ''
        Write-Host '  Tu Mind esta listo.' -ForegroundColor White
        Write-Host ("  Mind " + $pub.motor + " | $hecho") -ForegroundColor DarkGray
        Write-Host ''
        Write-Host '  Aqui empieza lo tuyo:' -ForegroundColor Gray
        Write-Host ("  " + $destino) -ForegroundColor White
        Write-Host ''
        Write-Host '  Abre tu IA en esa carpeta y escribe: hola' -ForegroundColor White
        Write-Host '  Mind se ira construyendo contigo, conversacion a conversacion.' -ForegroundColor Gray
        Write-Host ''
        Write-Host '  Para actualizar o reparar: repite este comando.' -ForegroundColor DarkGray

        if (-not $env:MIND_SIN_PREGUNTAS) {
            $resp = ''
            Write-Host ''
            Write-Host '  Opcional: tu IA puede encontrar Mind desde cualquier carpeta.' -ForegroundColor Gray
            Write-Host '  Se agrega su ubicacion a las instrucciones globales de tu IA' -ForegroundColor DarkGray
            Write-Host '  (CLAUDE.md, AGENTS.md o GEMINI.md), guardando una copia previa.' -ForegroundColor DarkGray
            try { $resp = Read-Host '  Activar? [s/N]' } catch {}
            if ($resp -match '^\s*(s|si|y|yes)\s*$') {
                $bloque = "<!-- mind:inicio -->`r`nMind (segundo cerebro de esta persona) esta en `"$destino`". Fuera de esa carpeta, antes de una conversacion sustantiva, lee `"$destino\Bienvenida.md`" y sigue su arranque.`r`n<!-- /mind:inicio -->`r`n"
                $globales = @(
                    (Join-Path $HOME '.claude\CLAUDE.md'),
                    (Join-Path $HOME '.codex\AGENTS.md'),
                    (Join-Path $HOME '.gemini\GEMINI.md')
                )
                $tocados = @()
                foreach ($g in $globales) {
                    if (-not (Test-Path -LiteralPath (Split-Path $g))) { continue }
                    $texto = ''
                    if (Test-Path -LiteralPath $g) {
                        $texto = [IO.File]::ReadAllText($g)
                        if ($texto -notmatch '<!-- mind:inicio -->') { Copy-Item -LiteralPath $g -Destination ($g + '.antes-de-mind') -Force }
                        $texto = [regex]::Replace($texto, '(?s)<!-- mind:inicio -->.*?<!-- /mind:inicio -->\r?\n?', '')
                        if ($texto -and -not $texto.EndsWith("`n")) { $texto += "`r`n" }
                    }
                    [IO.File]::WriteAllText($g, $texto + $bloque, $sinUtf8)
                    $tocados += $g
                }
                if ($tocados) {
                    Write-Host '  Listo. Tu IA ya puede encontrar Mind desde otras carpetas.' -ForegroundColor White
                    foreach ($g in $tocados) { Write-Host ('  ' + $g) -ForegroundColor DarkGray }
                } else {
                    Write-Host '  No encontre una IA configurada. Puedes empezar desde la carpeta Mind.' -ForegroundColor Gray
                }
            }
        }
    } catch {
        Write-Host ''
        Write-Host '  La instalacion no pudo terminar.' -ForegroundColor White
        Write-Host ('  ' + $_.Exception.Message) -ForegroundColor Gray
        if ($creada -and (Test-Path -LiteralPath $destino)) { Remove-Item -LiteralPath $destino -Recurse -Force -ErrorAction SilentlyContinue }
    } finally {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

Install-Mind
