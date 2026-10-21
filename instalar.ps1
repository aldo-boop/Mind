# Mind by Api D'Uniam Enterprises - instalador y reparador.
# Windows PowerShell 5.1 o superior. Solo ASCII a proposito: se ejecuta tal cual llega por la red.
#
#   irm https://raw.githubusercontent.com/aldo-boop/Mind/main/instalar.ps1 | iex
#
# Instala Mind en el Escritorio (carpeta "Mind"). Si ya hay un Mind, lo actualiza o lo repara
# conservando Memoria y piezas propias. Variables opcionales: MIND_DESTINO, MIND_SIN_PREGUNTAS.

function Install-Mind {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

    $base = if ($env:MIND_BASE) { $env:MIND_BASE.TrimEnd('/') } else { 'https://aldo-boop.github.io/Mind/estable' }
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

    try {
        $existe = Test-Path -LiteralPath $destino
        $esMind = $existe -and ((Test-Path -LiteralPath (Join-Path $destino 'Motor\version.json')) -or (Test-Path -LiteralPath (Join-Path $destino 'Mind.cmd')))
        if ($existe -and -not $esMind -and (Get-ChildItem -LiteralPath $destino -Force | Select-Object -First 1)) {
            throw "La carpeta $destino ya existe y no es un Mind. Elige otra: `$env:MIND_DESTINO = 'C:\ruta\Mind'; y repite el comando."
        }

        New-Item -ItemType Directory -Path $tmp | Out-Null
        $web = New-Object Net.WebClient
        $web.Encoding = [Text.Encoding]::UTF8

        Write-Host 'Consultando la version oficial de Mind...'
        $sobre = $web.DownloadString("$base/canal.json") | ConvertFrom-Json
        $pub = $sobre.contenido | ConvertFrom-Json
        if ($pub.paquete.url -notmatch '^[A-Za-z0-9._-]+\.zip$' -or $pub.paquete.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'El descriptor de la version no es valido; no se instalo nada.' }
        if ($pub.vence -and ([datetime]::Parse($pub.vence).ToUniversalTime() -lt [datetime]::UtcNow)) { throw 'La publicacion oficial vencio. Avisa a Api D''Uniam Enterprises; no se instalo nada.' }

        Write-Host ('Descargando Mind ' + $pub.motor + ' (' + [math]::Round($pub.paquete.bytes / 1MB) + ' MB)...')
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
            Write-Host ("Mind ya esta en $destino (" + $(if ($instalada) { $instalada } else { 'version desconocida' }) + '). Aplicando: ' + $operacion + '...')
            $null = Ejecutar-Mind (Join-Path $oficial 'Mind.cmd') @{ operacion = $operacion; destino = $destino }
            $hecho = if ($operacion -eq 'reparar-local') { 'reparado' } else { 'actualizado' }
        } else {
            $creada = -not $existe
            [IO.Compression.ZipFile]::ExtractToDirectory($zip, $destino)
            $hecho = 'instalado'
        }

        # Un ZIP no guarda carpetas vacias: se crean las que nombran Bienvenida y Funciones.
        foreach ($c in 'Motor\Capacidades\Base', 'Motor\Capacidades\Del usuario', 'Motor\Funciones\Del usuario') { New-Item -ItemType Directory -Force -Path (Join-Path $destino $c) | Out-Null }

        Write-Host 'Comprobando cada archivo contra el manifiesto oficial...'
        $revision = Ejecutar-Mind (Join-Path $destino 'Mind.cmd') @{ operacion = 'revisar' }
        $r = $revision | ConvertFrom-Json
        if ($r.problemasTotal -gt 0) { throw ('Quedaron ' + $r.problemasTotal + ' archivos distintos al manifiesto oficial.') }

        Write-Host ''
        Write-Host "Listo: Mind $hecho en $destino" -ForegroundColor Green
        Write-Host 'Abre tu IA (Claude Code, Codex, Gemini, Cursor, Copilot...) dentro de esa carpeta y escribe: hola'
        Write-Host 'Para actualizar o reparar, repite el comando de instalacion o abre Recuperar.cmd en la carpeta.'

        if (-not $env:MIND_SIN_PREGUNTAS) {
            $resp = ''
            try { $resp = Read-Host 'Quieres que tu IA encuentre Mind desde cualquier carpeta? Anade un bloque marcado a CLAUDE.md, AGENTS.md o GEMINI.md globales de tu usuario (s/N)' } catch {}
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
                if ($tocados) { Write-Host ('Anclado en: ' + ($tocados -join ', ')) } else { Write-Host 'No encontre CLAUDE.md, Codex ni Gemini en tu usuario; no cambie nada.' }
            }
        }
    } catch {
        Write-Host ''
        Write-Host ('No se pudo completar: ' + $_.Exception.Message) -ForegroundColor Red
        if ($creada -and (Test-Path -LiteralPath $destino)) { Remove-Item -LiteralPath $destino -Recurse -Force -ErrorAction SilentlyContinue }
    } finally {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

Install-Mind
