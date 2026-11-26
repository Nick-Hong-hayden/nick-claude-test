# SVG Stop-Motion Generator

처음·중간·끝 프레임에 SVG를 올리면 그 사이 포즈를 계산해 스톱모션 영상으로 만드는 웹 도구예요.

## 여는 방법
- 배포 주소: `https://nick-claude-test.vercel.app/stopmotion-generator/`
- 로컬: `index.html`을 Chrome으로 열어요. 파일 하나로 동작하고 설치할 것은 없어요.

## 기능
- 키 프레임: 처음 · 중간(여러 개) · 끝 SVG 업로드, 키마다 크기 조절
- 사이 프레임 계산(모프), 프레임 수 · FPS · 반복 방식(한 방향 / 왕복)
- 질감: 점토(색 · 볼륨 · 갈라짐), 스탬프(감도 · 입자)
- 내보내기: Export Video — 한 번 재생한 길이를 MP4(브라우저에 따라 WebM)로 저장
