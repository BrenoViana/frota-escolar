# ajuste se mudar o user/repo
OWNER="BrenoViana"; REPO="frota-escolar"

# garantir login ok
gh auth status

# definir main como default (se ainda não for)
gh repo edit "$OWNER/$REPO" --default-branch main

# proteção MAIN (PR + 1 review, sem force push/sem delete, sem checks por enquanto)
gh api -X PUT -H "Accept: application/vnd.github+json" \
  "repos/$OWNER/$REPO/branches/main/protection" \
  -f required_status_checks='{"strict":false,"contexts":[]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  -f restrictions='null' \
  -f allow_force_pushes=false \
  -f allow_deletions=false

# proteção DEVELOP (um pouco mais leve, mas com PR + 1 review)
gh api -X PUT -H "Accept: application/vnd.github+json" \
  "repos/$OWNER/$REPO/branches/develop/protection" \
  -f required_status_checks='{"strict":false,"contexts":[]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  -f restrictions='null' \
  -f allow_force_pushes=false \
  -f allow_deletions=false
