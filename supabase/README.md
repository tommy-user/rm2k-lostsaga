# 웹판 서버 (Supabase)

프로젝트 `lostsaga-web` (ref `rsjseachgivzvkuspxua`, 서울). 웹판 런처(`docs/play/`)의 클라우드 세이브를 맡는다.

## 원칙

- 웹판 세이브는 **새 게임부터 쌓은 것만** 받는다. PC 세이브 가져오기는 없다 (내보내기만 있음).
- 처음 접속하면 익명 계정으로 시작하고, Google·카카오를 연결하면 같은 계정이 정식 계정이 된다.
- 능력치 같은 세부 검사는 하지 않는다. 막는 것은 "출처를 모르는 세이브가 갑자기 올라오는 것" 하나다.

## 표

| 표 | 내용 | 클라이언트 |
|---|---|---|
| `base_saves` | 게임 버전별 기준 세이브 (Pages `/play/bases/<버전>.lsd`) | 읽기 |
| `runs` | 새 게임 한 번 = 한 줄. 시작 시각을 서버가 찍는다 | 자기 것 읽기 |
| `save_lineage` | 받은 모든 세이브의 해시와 출처. 지우지 않는다 | 없음 |
| `save_slots` | 슬롯별 `current` · `previous`, 다른 플레이에 덮인 세이브는 `overwritten` 30일 | 자기 것 읽기 |

세이브 본문은 기준 세이브와의 차이(fossil-delta + gzip)로 저장한다. 실제 세이브 11개로 재 보니 한 개에 2–8KB다 (원본 약 250KB).

## 흐름

1. **런처를 열 때**: `begin_session()` 이 시각을 찍는다.
2. **새 게임**: 런처의 "새로 시작" 을 누르면 `start_run(기준 세이브 이름)` 으로 run 을 만들어 둔다 (하루 30번까지). run 시작 시각은 1 의 시각이다. 게임 안 타이틀에서 새 게임을 고르거나 오프라인이었으면, 첫 저장(저장 횟수 `SaveSystem.save_count` 가 1)을 올릴 때 만든다.
3. **게임 안에서 저장**: 런처가 세이브 파일이 닫히는 순간을 잡아 `upload-save` Edge Function 에 보낸다.
   - 출처(`parent_hash`)는 이미 아는 세이브 중 저장 횟수가 하나 적고 플레이 시간이 더 짧은 것이다. 서버도 같은 조건을 확인한다.
   - 보내는 것: `slot`, `run_id`, `parent_hash`(첫 저장이면 null), `game_version`(기준 세이브 이름), gzip 한 원본 .lsd
   - 함수가 하는 것: 압축 풀기 → sha256 계산(서버가 직접) → 요약 추출(파티 첫 액터, 레벨, 맵, 플레이 프레임, 돈) → 기준 세이브와 차이 만들기 → `commit_save()`
4. **불러오기·다른 기기**: 런처가 플레이어를 켜기 전에 `save_slots` 를 읽고, 기준 세이브에 차이를 적용해 원본을 만든 뒤 sha256 이 `hash` 와 같은지 확인한다.

## `commit_save()` 가 거부하는 경우

| 결과 | 뜻 |
|---|---|
| `bad_run` | 내 run 이 아님 |
| `not_first_save` | 출처 없이 올라왔는데 저장 횟수가 1 이 아님 |
| `root_exists` | 이 run 의 첫 저장이 이미 있는데 또 출처 없이 올라옴 |
| `unknown_parent` | 출처가 이 run 에서 받은 적 없는 세이브이거나 저장 횟수가 이어지지 않음 (바꿔치기) |
| `time_backwards` | 출처보다 플레이 시간이 줄었음 |
| `too_fast` | 플레이 시간이 run 시작 뒤 실제로 흐른 시간 × 1.1 + 1분을 넘음 |

플레이 시간은 세이브의 `SaveSystem.frame_count`(60fps)다. 웹판은 빨리 감기를 끄므로 실제 시간보다 빨리 늘지 않는다. 온라인에서 시작한 플레이는 오프라인으로 이어 하다 나중에 올려도 run 시작 시각 기준이라 통과한다. 오프라인에서 새로 시작해 오래 한 플레이는 첫 저장을 올릴 때 `too_fast` 로 거부된다 (아직 처리 안 함).

주인공은 변수 43(주인공번호)이 아니라 **파티 첫 액터**로 본다. 실제 세이브 11개 중 9개에서 변수 43 이 0 이었다.

## 다루는 법

```sh
supabase link --project-ref rsjseachgivzvkuspxua
supabase db push          # migrations/ 반영 (DB 비밀번호가 필요하다. 모르면 대시보드 Settings → Database 에서 재설정)
supabase functions deploy upload-save
```

## 계정

- 처음 접속하면 익명(게스트) 계정을 만든다.
- 세이브가 있는 게스트는 "Google 계정 연결"(`linkIdentity`)로 같은 계정에 Google 을 붙인다. 세이브가 그대로 이어진다.
- 세이브가 없는 게스트(새 기기)는 "Google로 로그인"(`signInWithOAuth`)으로 기존 계정에 들어간다.
- 연결하려는 Google 계정이 이미 다른 계정에 붙어 있으면(`identity_already_exists`) 런처가 "그 계정으로 로그인"을 따로 묻는다. 그 경우 이 브라우저의 게스트 세이브는 따라가지 않는다.
- 런처는 이 기기 세이브의 주인 계정을 기억해 두고, 로그인한 계정으로 들어가거나 계정에서 나올 때만 이 기기 세이브를 비운다. 게스트 세션을 잃어 새 게스트가 된 경우는 남겨 둔다.
- Google OAuth 클라이언트: Google Cloud 프로젝트 `lostsaga-web`(htm2937@gmail.com), 리디렉트 `https://rsjseachgivzvkuspxua.supabase.co/auth/v1/callback`. 돌아올 주소는 `site_url`(Pages 의 `/play/`)과 `http://127.0.0.1:8765/**`.

## 오프라인

런처는 처음 접속할 때 게임 전체(`play/files.json` 목록, 약 82MB)를 Cache Storage 에 받아 두고, Service Worker(`docs/play/sw.js`)가 플레이어에게 꺼내 준다. 다음 접속부터는 목록의 해시가 바뀐 파일만 받는다. 오프라인에서 저장한 세이브는 대기열에 남았다가 다음에 온라인으로 열 때 올라간다.
