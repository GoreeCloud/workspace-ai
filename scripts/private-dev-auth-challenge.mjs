// Validate the actual owner Basic Auth challenge from the private NetBird route.
// A 403 is not proof that an authorized NetBird client reached the owner login gate.
export function isExpectedOwnerBasicChallenge(statusCode, wwwAuthenticate) {
  if (statusCode !== 401) return false
  const challenges = Array.isArray(wwwAuthenticate) ? wwwAuthenticate : [wwwAuthenticate]
  return challenges.some(value =>
    typeof value === 'string' && /^Basic\s+realm=(?:"[^"]+"|[^\s,]+)(?:\s|,|$)/i.test(value.trimStart())
  )
}
