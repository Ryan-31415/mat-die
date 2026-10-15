# 작업 3 선택적 취소 및 작업 4 준비

2026-10-15 KST. **선택적 철회안의 최종 검토를 완료했다. 현재 규칙의 정책 동일성·관련 기능·lint·프로덕션 빌드는 확인했지만, 기존 타입 오류와 기존 테스트 실패 때문에 전체 검증 통과로 표시하지 않는다. 사용자가 승인한 단일 로컬 철회 커밋에 이 보고서를 포함하며, 푸시·PR·작업 4 구현은 하지 않는다.**

## 1. 시작 상태와 이력

- 시작 로컬 main: `37e5510de43fa9124a927a7ec9a0ab4391652619`. index/worktree 깨끗함. C/D 미커밋 변경 없음: 이전 실험 소스는 이 커밋에 포함됨.
- 읽기 전용 원격 확인: 요청된 Ryan-31415/mat-die와 origin Ryan-31415/duel-arena 모두 main `e59da20f729fb003981e25bae2a2e8215d0b9208` 반환. 원격 설정 변경 없음.
- 작업 브랜치: `work/stage3-selective-revert`, 시작/현재 HEAD `e59da20`. 경로: `docs/ai-runs/stage3-selective-revert/worktree`.
- 기존 다른 두 Cursor worktree는 건드리지 않음. stash/reset/checkout/revert 커밋/index 변경 없음.
- 작업 도중 원본 main이 별도 프로세스의 `pull --tags origin main`으로 e59da20까지 fast-forward된 것을 발견. reflog 시각 2026-10-15 17:49:31 KST. 이 작업은 해당 pull을 실행하지 않았으며, 독립 worktree의 기준은 이미 같은 e59da20이므로 비교 소스에 영향 없음. 원본 main은 종료 확인 시 깨끗함.
- 두 대상 커밋의 전체 패치는 로컬 진단 폴더에 보관하고 파일 목록·호출 관계·후속 이력을 검토함. 대용량 역사적 결과를 다시 전수 해석하지 않음.

## 2. 분류와 실제 철회

| 분류 | 처리 |
|---|---|
| 사냥꾼 산탄 기대 피해 기반 기본 공격·집중 사격 조건 | 실제 전투 경로에서 제거. 기존 canHit 기본 공격과 기존 궁극기 조건 복원 |
| 로켓병 재장전 목표 거리·미래 발사 위치 보상 | 제거. 기존 300px/저체력 360px와 기존 이동 보상 복원 |
| 작업 3 후보 상세 재평가·추가 화산 착지 벌점 | 제거. 기존 공유 화산 위험·퇴로 로직 유지 |
| 작업 3 원거리 정책용 목표 캐시 확장·호출 계수 | 제거. 궁수 캐시와 궁수 상세 사격 연동 유지 |
| hunter.ts / rangedShots.ts / rangedEnvironment.ts | 역사적 도구·순수 정확성 테스트의 의존성 때문에 보존. live controller/combat/navigation 호출은 없음 |
| RangedShotPolicy / PositionDecision.rangedWork 타입 | 전자는 진단 함수 반환 타입으로만 사용하며 사용처 없는 combat.ts 재수출은 최종 검토에서 제거. 후자는 역사적 진단 및 비활성 확인 테스트용 선택 필드이며 현재 정책에서 출력하지 않음 |
| rocketeer.ts 정확성 보정 | 현재 폭발 반경 상수, 덩굴/코일 동시 충돌 순서, 즉시 콜백 보정 유지. leadMs 인터페이스는 진단 도구에 필요해 보존하되 현재 전투 호출은 기존 방식 |
| 평가 계측·보고서·명세·과거 스크립트 | 보존. 자동 실행하거나 현재 규칙 성능의 근거로 재사용하지 않음 |

37e5510 후속 수정 → 6496c5a 초기 구현 순으로 controller/combat/navigation의 역방향 패치만 적용했다. 최신 main에서 이 세 파일에 대상 커밋 이후 변경이 없음을 확인한 뒤 `git apply --reverse --check`로 각각 검사했다. 파일 전체를 옛 버전으로 복사하지 않았고, Git 충돌은 없었다.

수동 조정은 역사적 진단 타입을 보존하는 재수출과 obsolete 테스트 아카이브뿐이다. 전술 가중치·규칙·밸런스 수정 없음. D에서 이미 복원된 사냥꾼 이동을 일시적으로 되짚은 뒤 최종적으로 작업 3 이전 정책으로 정리했으며, 사냥꾼의 C/D 산탄 전투 정책도 함께 비활성화했다.

## 3. 보존한 독립 변경

대상 이후 이력: 8a7e4de, 463c844, 748df2b, 3f4f915, b68adeb, 961a768, 84585d6, 146dcfb, 001402d, 5ba4f8d, 96e27a0, 0e57bb8, fa1e101, 27d8ba6, a00a7f2, 96afc5b, e59da20.

- 무기 표시·근접 모션·범위·넉백 방향, 사신 박쥐 경계/미적중 처리
- 캐릭터 선택 페이지·UI·페이지 배포·라우팅·무승부 알림
- 과학자 충전 중 플라스크 표시, 사신 잔상, 강화 해커 미사일 표시
- 5ba4f8d의 원형 눈보라 렌더링·충돌·결빙 지속·이동 판정
- 작업 1 궁수 전술과 작업 2의 archerShot/world/projectile CPU 개선
- 현재 타입·캐릭터·엔진·난이도·관측·난수 소스

시작에 기록한 247개 파일 중 기존 파일 11개의 수정/이동만 허용했고, 나머지 **236개는 바이트 해시 동일**임을 검사했다. 특히 useGameEngine.ts, combatPhysics.ts, projectile.ts, game.ts, ai.ts, difficulty.ts, perception.ts, engine.integration.test.tsx 및 UI 파일은 변경하지 않았다.

## 4. 파일 상태

- 변경: controller.ts, combat.ts, navigation.ts, rangedShots.ts, stage3.test.ts, hunterReload.test.ts.
- 아카이브 이동: stage3.evaluation.test.tsx, stage3CurrentRulesCombat.evaluation.test.tsx, hunterC.evaluation.test.tsx, hunterACD.evaluation.test.tsx, hunterD.test.ts, hunterReload.test.ts.
- 보존 대상: `src/test/stage3Archive/<원래 이름>.txt`. 6개 모두 원래 바이트와 동일. CI 검색/컴파일에서 제외되지만 기록은 삭제하지 않음. 아래 최종 검토에서 유효한 부분은 활성 테스트로 복원했다.
- 추가: stage3Revert.test.ts, stage3RulesPreservation.test.tsx, stage3RevertFixtures.mjs, 아카이브 README, 이 보고서와 stage3CancellationManifest.json.
- 보존: 모든 과거 평가·CPU·정합성 도구 및 stage3/current-rules 결과 명세. 원본 docs의 160/40/60경기와 A/B/C/D 번들을 포함한 관련 파일 176개의 크기/해시 목록을 별도 저장함.
- 검증 전용 ignored 파일: 같은 최신 규칙 before/after/legacy 번들, 기존 fixture의 복사본, 원시 테스트 출력, 실패 비교 자료. 기존 결과를 덮어쓰지 않음.

## 5. 검증

### 현재 규칙의 정책 비교

- 취소 전 번들: a216c1b0c0317ce0ad83af0e9f309f3d45abb9d17140d38eaa5240a7355ad2a6.
- 취소 후 및 현재 규칙+작업 3 이전 선택 정책 번들: **739fca632b1bec21a81af8dc7a84afe4929096eb9252cbe091348a4e05578b04** (바이트 동일).
- 이전 정책 비교 번들은 controller/combat/navigation의 선택 정책만 작업 3 이전으로 읽고, 나머지 코드는 e59da20의 현재 규칙을 사용함. 옛 A/C/D 엔진과의 동일성을 요구하지 않음.
- 비대상 8종 × 5맵 × 5난이도 × 2장면 × 3관측 = **1,200회** 입력·메모리·세션 RNG를 포함한 전체 반환 런타임 동일.
- 사냥꾼·로켓병의 동일 현재 규칙 이전 정책과 **300회** 런타임 동일.
- 원형 눈보라: 현재 엔진 취소 전후 1콜백 장면 3개(사각형 모서리 제외/원 경계 겹침/원 밖)를 직접 비교하여 동일성과 피해 여부 확인.
- 기존 산탄·집중 사격·그물·코일·현재 로켓 정확성 검사, 궁수·근접·마법사·얼음 마법사·과학자·해커 관련 선택 검사 수행.

### 결과와 기존 실패

- 선택 실행한 고유 테스트 **677개 중 444 통과 / 233 실패**. 전체 suite를 실행한 것은 아님. 재실행 횟수를 통과 수에 중복 합산하지 않음.
- 최초 새 worktree에는 ignored baseline fixture가 없어 250개 테스트가 추가로 실패했음. 원본 fixture를 정확히 복사하여 26개가 회복되고, 나머지는 현재/과거 규칙 차이 등을 드러냄. 이 환경 실패 기록도 보존.
- 잔여 233건을 같은 최신 main의 취소 전 공유 AI 코드로 다시 실행하여 **314개 테스트의 상태가 전부 동일(81 통과/233 실패)**함을 확인. 새 회귀로 확인된 실패 0.
- 기존 실패: actionStart 198, movementParity 25, combatRules의 bat 1, rocketCoil 8, skillDirection의 그물 초기 y속도 −115 기대 1. 과거 엔진 전체 상태·규칙과 현재를 비교하는 검사들은 현 정책의 승인 기준이 아님. 로켓/코일 실패 8건의 근본 원인을 이번 범위에서 수정하지 않음.
- 변경 파일 ESLint 통과, production Vite build 통과. Browserslist 오래됨/500kB 초과 chunk 경고는 남음.
- 최종 앱 타입 검사 **미통과**: HazardRenderer.tsx:128 TS2322, blizzard 스타일의 boxSizing이 string으로 추론됨. 5ba4f8d에서 추가된 줄이며 이 파일은 수정하지 않음. 동일 현재 소스에서 취소 전 공유 AI를 읽는 TS 검사와 취소 후 진단이 동일한 1건임을 확인. 경고 억제/검사 제외로 통과시키지 않음.
- 로컬 ignored summarize-ai-evaluation.mjs와 baseline fixture 복사본은 worktree의 기존 검사 의존성을 충족하기 위해서만 사용. 저장소 관리 대상에 추가하지 않음.
- 브라우저/실제 플레이/프레임 성능 미검증. 신규 전투 평가 0경기, 공식 CPU 벤치마크 0회. 기존 CPU 상태 미확정.

## 6. 작업 4 준비 메모 (미구현)

| 대상 | 현재 판단과 다음 검토 지점 |
|---|---|
| 마법사 | combat.ts:144 궁극기는 기존 지속 상태와 420px 접근 조건, :175 낙하시간을 y/750으로 근사해 관측된 착지 x와 덩굴 차단 확인. 낙하 후 화염 지대의 통로 차단 가치는 별도 성공 결과로 분리되어 있지 않음 |
| 얼음 마법사 | combat.ts:149 곡사 눈보라 발사 가능성, :226 대형 눈덩이 직선 명중 검사. navigation.ts의 결빙 게이지≥3이면 pressure/210px. combatPhysics.ts의 5중첩 결빙·해제·시간 경과·눈보라 내 지속 보정은 현재 규칙 유지 |
| 묘지 | controller.ts의 표시된 번개 시점/반경 위험과 영혼 영역 체력·마나 필요도 보상, navigation.ts의 위험 회피/goal 재사용 제한 유지. 엔진의 실제 영혼 회복·번개 생성/경고 시점과 비교할 기반이 있음 |
| 원형 눈보라 | 엔진 피해·이동·결빙 지속은 circleIntersectsRect 공유. AI hazardRisk와 pools의 일부 위험 평가는 여전히 사각형 overlapsPlayer를 사용하므로 원 모서리를 과대평가할 가능성이 있음. 이는 최신 main에 이미 존재하며 이번에 변경하지 않음; 작업 4의 정합성 검토 항목 |
| 재사용 도구 | aiEvaluationRunner/Diagnostics/Session, cpuScene/aiCpu.mjs, difficulty/perception, combatProposal/charge/coil/archer/current-rule 단위 검사를 재사용 가능. 역사적 실행기/번들은 소스·규칙 해시가 달라 그대로 새 기준선으로 사용하면 안 됨 |

## 7. 새로운 출발 상태 및 남은 검토

후보 기준: e59da20 + 선택적 철회 미커밋 diff.

- 최종 런타임 소스 지문: `3f23a2644e90c1d97039a89c478b2cdf3f4faee1f6cc24b24090d97508c0c396`. 이전 검토 지문은 manifest의 previousRuntimeSourceFingerprint에 보존.
- 코어 번들 지문과 전체 파일별 해시는 stage3CancellationManifest.json에 기록.
- manifest는 단일 로컬 커밋 직전 snapshot이다. 그 안의 worktreeHead는 부모 e59da20이며, 이후 이 보고서를 포함한 철회 커밋이 작업 4의 코드 기준선이다. 실제 새 커밋 해시는 Git 기록과 로컬 commit-receipt.json으로 확인한다. 원격에는 반영하지 않는다.
- 선택적 철회는 검토 가능한 상태이나 **전체 검증 완료 기준은 충족하지 못함**. 기존 렌더러 타입 오류와 오래된 검사의 현재 규칙 적용 범위를 별도 정리해야 함.
- 역사적 순수 예측 도우미는 삭제하지 않았지만 앱 선택 경로에서 호출되지 않음. 기존 미커밋/원격 main을 되돌리지 않음.
- 작업 4 전술은 아직 구현하지 않았고, 원격 반영 및 다음 작업의 범위는 사용자 검토를 기다림.

## 8. 로컬 커밋 전 최종 검토

원격 main을 다시 읽기 전용으로 확인했으며 여전히 e59da20이었다. 기존 worktree·철회 diff를 재사용했고 새 철회나 main 변경은 하지 않았다.

| 아카이브 원본 | 개별 판정 |
|---|---|
| stage3.evaluation.test.tsx | 과거 단계 3 명세의 최대 160경기 실행 진입점. 역사적 실행 도구로 보존, 실행하지 않음 |
| stage3CurrentRulesCombat.evaluation.test.tsx | 당시 동결 A/B 현재 규칙 160경기 진입점. 역사적 조건/번들용이므로 아카이브 유지 |
| hunterC.evaluation.test.tsx | 당시 A/C 40경기 진입점. 아카이브 유지 |
| hunterACD.evaluation.test.tsx | 당시 A/C/D 60경기 진입점. 아카이브 유지 |
| hunterD.test.ts | C의 사격 판정 유지 조건 2개와 과거 A/C 비교는 보존만 함. 24개 고정 관측은 stage3Revert.test.ts에서 동일 현재 규칙 이전 정책과 비교하도록 활성화 |
| hunterReload.test.ts | 현재에도 유효한 재장전·집중 사격·저체력·관측 제한·회피 검사 6개를 원래 테스트 경로에 복원. 과거 A/C 및 9종 동일성 비교는 아카이브 유지 |

최종 대상 검사 **85/85 통과**: stage3Revert 30, hunterReload 6, 원형 눈보라 엔진 3, 순수 예측/비활성 확인 9, 현재 규칙 10, 궁수 5, combatProposal 14, chargeProposal 8. 1,200회 비대상·300회 대상 정책 복원 검사도 다시 통과했다. 이전 677개 선택 검사와 중복되므로 단순 합산하지 않는다.

기존 233개 실패는 저장된 취소 전후 JSON에서 **테스트 이름·상태·failureMessages 전체가 정확히 동일**함을 재확인했다. 오류를 축약하거나 필터링하여 일치시킨 것이 아니다. 코드의 현재 코어 번들 해시도 이전 검토/현재 규칙 이전 정책과 동일하다. hunter/rangedShots/rangedEnvironment 3개 모듈은 실제 코어 번들 의존 그래프에 포함되지 않는다.

최종 변경 파일 lint와 프로덕션 빌드는 통과했다. 타입 검사는 같은 기존 HazardRenderer TS2322 한 건이며, 해당 파일은 철회 diff에 없다. 타입 오류를 숨기거나 무관한 수정을 커밋에 섞지 않는다.

작업 4 인계:

- 마법사/얼음 마법사의 5맵 엔진 단위 장면 10개를 포함한 engine.integration 77개는 이전 검토에서 통과. 이번 최종 검토에서는 combatProposal 14개, chargeProposal 8개, 원형 눈보라 경계 3개를 재확인했다. 이는 승률 평가가 아니다.
- 기존 실패에는 결빙·대형 눈덩이·눈보라 이동 관련 이름의 검사 27건도 포함되어 있다. 과거 엔진/규칙 비교를 현 규칙 검증으로 그대로 사용하면 안 되므로 작업 4가 변경할 경로의 현재 규칙 기준 검사를 먼저 확립해야 한다. 233건 전체를 일괄 수정할 필요는 없다.
- 전체 타입 게이트를 통과시키려면 렌더러 boxSizing 타입 부채를 별도 수정해야 한다. 이번 철회 커밋에서는 제외한다.
- 원형 눈보라의 엔진 충돌과 사각형 AI 위험 평가의 불일치는 그대로 남는다. 작업 4에서 지대 전술을 확장하기 전 정합성 검토가 필요하다.
- `node src/test/stage3RevertFixtures.mjs`는 현재 동결 소스와 Git 이력을 검사하고 로컬 동일 규칙 비교 fixture를 준비한다. 기존 파일이 있으면 해시 확인만 하며 다른 내용을 덮어쓰지 않는다. 전체 Git 이력과 동일 의존성이 필요하고 소스 변경 시 자동 재동결하지 않는다.
- 거대한 번들·원시 경기·테스트 로그는 기존 ignored docs/scripts에 보존하고 커밋하지 않는다. 관리 대상에는 철회 코드, 테스트·작은 원본 아카이브, 재현 도구, 명세·보고서만 포함한다.
