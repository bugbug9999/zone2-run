# 데드엔드 스윕: `node test/deadend-sweep.mjs` (프로젝트 루트에서, jsdom 필요 — 없으면 `npm i -D jsdom`)
# 검사: 4화면(onboard/dash/run/sum)+오버레이 × 17개 도달가능 상태(빈 데이터·GPS없음·데모·즉시종료·회수 등)에서 "뒤로/닫기 외 액션 요소 ≥1" 불변식. exit 0=통과, 1=데드엔드.
# 앱 로직은 jsdom에서 실제 구동(GPS·타이머·시계는 스텁으로 수동 제어). 화면 추가 시 이 파일에 상태 주행 한 블록 추가.
