from pathlib import Path
p=Path('android-shell/app/build.gradle')
s=p.read_text().replace('versionCode 17','versionCode 19').replace('1.0.17-local','1.0.19-local')
s=s.replace('app.floatphone.doremy.local"','app.floatphone.doremy.local.v2"').replace('app.floatphone.hazel.local"','app.floatphone.hazel.local.v2"')
p.write_text(s)
