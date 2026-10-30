-- upload-save Edge Function 이 기준 세이브 본문을 읽는다. 새 표 자동 공개를 꺼 두어 service_role 에도 직접 준다.
grant select on public.base_saves to service_role;
