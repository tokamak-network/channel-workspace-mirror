export function isAdminAuthorized(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${token}`;
}

export function hasAdminToken() {
  return Boolean(process.env.ADMIN_TOKEN);
}
