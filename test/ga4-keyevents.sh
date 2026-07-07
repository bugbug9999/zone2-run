#!/bin/zsh
# zone2 GA4 키이벤트 사전등록 (24~48h 대기 우회, 하네스 스킬 ga4-instant-setup 절차)
# 사용법:
#   1) analytics.google.com 위저드로 property 생성 (사이트: https://bugbug9999.github.io/zone2-run/)
#   2) https://developers.google.com/oauthplayground 에서 scope
#      https://www.googleapis.com/auth/analytics.edit 로 access token 발급 (1시간 유효)
#   3) TOKEN=ya29... PROP=<property숫자ID> ./ga4-keyevents.sh
set -e
: ${TOKEN:?TOKEN 필요} ; : ${PROP:?PROP 필요}

for E in onboard_complete run_end; do
  curl -s -X POST "https://analyticsadmin.googleapis.com/v1beta/properties/$PROP/keyEvents" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"eventName\":\"$E\",\"countingMethod\":\"ONCE_PER_SESSION\"}" | head -c 300; echo
done

echo "--- 등록 확인 ---"
curl -s "https://analyticsadmin.googleapis.com/v1beta/properties/$PROP/keyEvents" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"eventName": *"[^"]*"'
