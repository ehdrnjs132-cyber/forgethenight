# FORGE THE NIGHT

> Forge Your Power. Survive the Night.

2D 탑다운 액션 서바이버 + 무기 강화 + 하드코어 로그라이크. Phaser 3 + TypeScript.

- 기준 사양: [GAME_DESIGN.md](GAME_DESIGN.md)
- 미확정 항목에 대한 결정: [docs/DECISIONS.md](docs/DECISIONS.md)
- 개발 단계와 진행 상황: [docs/PLAN.md](docs/PLAN.md)
- 강화 확률 시뮬레이션: [docs/sim/enhance-report.md](docs/sim/enhance-report.md)

## 명령

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm test           # 자동 테스트
npm run build      # 타입 검사 + 배포용 빌드 (dist/)
npm run table      # tools/sim/gen-table.ts 의 곡선으로 확률표 JSON 재생성
npm run sim        # 강화 시뮬레이션 리포트 생성
```

## 구조

- `src/config/` 밸런스 수치와 텍스트. 확률표는 `enhancement-table.json`
- `src/core/` 게임 규칙. Phaser를 import하지 않는 순수 TypeScript (테스트·시뮬레이션 대상)
- `src/presentation/` Phaser 장면, 연출, UI, 사운드
- `tools/sim/` 시뮬레이터, `tools/art/` Higgsfield 아트 파이프라인
- `tests/` Vitest

## 디버그

- 브라우저 콘솔의 `window.__ftn` 으로 `core`(게임 상태)와 `game`(Phaser)에 접근
- 주소에 `?timer` 를 붙이면 화면이 그려지지 않는 상황에서도 게임 루프가 돈다 (자동 점검용)
