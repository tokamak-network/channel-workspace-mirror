alter table observer_channels
  add column if not exists toll_refund_cutoff1_seconds text,
  add column if not exists toll_refund_cutoff2_seconds text,
  add column if not exists toll_refund_cutoff3_seconds text,
  add column if not exists toll_refund_bps1 text,
  add column if not exists toll_refund_bps2 text,
  add column if not exists toll_refund_bps3 text,
  add column if not exists toll_refund_bps4 text;
