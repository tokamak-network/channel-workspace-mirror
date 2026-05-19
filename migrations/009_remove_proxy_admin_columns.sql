alter table observer_channels
  drop column if exists bridge_core_proxy_admin,
  drop column if exists bridge_token_vault_proxy_admin;
