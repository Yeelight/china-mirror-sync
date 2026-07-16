export function redactText(value, secrets = []) {
  let output = String(value ?? "");
  const candidates = [...new Set(secrets.filter((secret) => typeof secret === "string" && secret.length > 0))]
    .sort((left, right) => right.length - left.length);
  for (const secret of candidates) output = output.split(secret).join("****");
  output = output.replace(/(authorization\s*:\s*)(?:bearer\s+|token\s+)?[^\s]+/gi, "$1****");
  output = output.replace(/([a-z][a-z0-9+.-]*:\/\/)([^@\s/]+)@/gi, "$1****@");
  output = output.replace(/([?&](?:access_token|private_token|token)=)[^&#\s]+/gi, "$1****");
  return output;
}
