# GODBODY Pose Generator

목각 관절인형으로 포즈를 잡고, 브랜드 그림체(마티스 컷아웃 실루엣 + 네거티브 스페이스)로 바꿔 SVG로 내보내는 웹 도구예요.

## 여는 방법
- 배포 주소: `https://nick-claude-test.vercel.app/godbody-pose-generator/`
- 로컬: 이 폴더의 `index.html`을 Chrome으로 열어요. 설치할 것은 없고, three.js와 paper.js를 cdnjs에서 불러오므로 인터넷 연결이 필요해요.

## 사용 순서
1. **Pose (3D)** — 목각 인형의 파란 점을 드래그해서 관절을 꺾어요. 나무 부위를 클릭하면 그 관절이 선택되고 오른쪽 슬라이더로 정밀하게 조절해요.
   - 빈 곳 드래그: 회전 · 우클릭(또는 Shift) 드래그: 이동 · 휠: 확대/축소
   - Torso 패널: 골반(Pelvis) / 허리(Waist) / 가슴(Chest)을 각각 Bend · Turn · Tilt
2. **View** — Front · 3/4 · Side · Back · Above 버튼, Lens(화각), Height로 구도를 잡아요.
3. **Apply** — 현재 구도로 브랜드 그림체 벡터를 만들어요. Apply Automatically를 켜두면 바로바로 갱신돼요.
4. **Export SVG / Copy SVG** — 하나의 compound path로 된 SVG를 저장하거나 복사해요.

## 프리셋
아래 썸네일 8개는 브랜드 원본 그래픽이에요(Symbol, Arabesque, Stand, Recline, Arms Up, Lean Back, Kneel, Knee Hug). 누르면 인형이 그 자세와 카메라, 그 그래픽 고유의 과장 비율(허벅지·다리 길이 등)을 불러와요.

## 조절값
- **Character** — 엉덩이, 허벅지, 몸통, 종아리, 다리 길이, 팔 굵기, 팔 길이, 가슴, 머리
- **Drawing** — Negative Space(겹친 부위 틈 두께), Fillet(겨드랑이·골반 이음 부드러움), Curve Smoothness(곡선 정리 정도), 색상, 배경 포함 여부

## 파일 구성
- `index.html` — 화면 구조
- `css/style.css` — Apple 기본 UI 스타일
- `js/mannequin.js` — 브랜드 체형의 뼈대와 볼륨(원본 SVG에서 측정한 비율)
- `js/doll.js` — GESTALTA 스타일 목각 인형 모델(같은 뼈대 위에 입힘)
- `js/rig3d.js` — three.js로 인형 만들기, 포즈 적용, 2D 투영
- `js/style2d.js` — Apply 렌더러: 실루엣 합치기, 깊이 기반 네거티브 스페이스, 베지어 곡선 정리
- `js/presets.js` — 브랜드 그래픽 8종을 재현한 포즈·카메라·비율
- `js/assets.js` — 브랜드 원본 SVG(프리셋 썸네일)
- `js/app.js` — 화면 조작, 관절 드래그, 내보내기

## 사용 라이브러리
- [three.js](https://threejs.org) r128 (MIT)
- [paper.js](http://paperjs.org) 0.12.17 (MIT)
