-- pg_net relocation resets its owned request sequence. Advance it past all
-- preserved response IDs and past any ID already generated after relocation.
-- Without this, future requests can reuse IDs still present in _http_response.
do $sequence_fix$
declare
  max_response_id bigint;
  current_sequence_value bigint;
begin
  select coalesce(max(id), 0) into max_response_id
    from net._http_response;

  execute 'select last_value from net.http_request_queue_id_seq'
    into current_sequence_value;

  perform pg_catalog.setval(
    'net.http_request_queue_id_seq'::regclass,
    greatest(max_response_id, current_sequence_value),
    true
  );
end
$sequence_fix$;

do $verify_sequence$
declare
  max_response_id bigint;
  current_sequence_value bigint;
begin
  select coalesce(max(id), 0) into max_response_id
    from net._http_response;
  execute 'select last_value from net.http_request_queue_id_seq'
    into current_sequence_value;
  if current_sequence_value < max_response_id then
    raise exception 'pg_net sequence is behind preserved response ids (sequence %, max response id %)', current_sequence_value, max_response_id;
  end if;
end
$verify_sequence$;
