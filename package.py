from pathlib import Path
import zipfile
P=Path(__file__).resolve().parent
def build(name,body,css,scripts):
    def script(f):return '<script>'+P.joinpath(f).read_text().replace('</script','<\\/script')+'</script>'
    text='<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff"><title>'+('พิมพ์ป้ายแจกแจงรายการ' if name=='Silicon' else name)+'</title><style>'+''.join(P.joinpath(c).read_text() for c in ([css] if isinstance(css,str) else css))+'</style></head><body>'+P.joinpath(body).read_text()+''.join(script(f) for f in scripts)+'</body></html>'
    P.joinpath(name+'.html').write_text(text)
build('LabelScan','body.html','style.css',['qr.js','common.js','vendor/jsqr.js','app.js','presence.js'])
build('Admin','admin-body.html','admin.css',['common.js','vendor/xlsx.js','export.js','admin.js','admin-import.js','presence.js'])
build('Tags','tags-body.html',['tags.css','printer-ui.css'],['common.js','vendor/xlsx.js','master-import.js','print-pdf.js','printer-ui.js','tags.js','presence.js'])
build('Silicon','silicon-body.html',['silicon.css','printer-ui.css'],['common.js','print-pdf.js','printer-ui.js','silicon.js','presence.js'])
files=[p for p in P.rglob('*') if p.is_file() and p.relative_to(P).parts[0] not in ('data','__pycache__','node_modules','.git') and p.suffix not in ('.zip',)]
with zipfile.ZipFile(P.parent/'LabelScan-Batch-3003.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in files:z.write(p,'label-scan-batch/'+str(p.relative_to(P)))
print('Built HTML and ZIP; files:',len(files))
