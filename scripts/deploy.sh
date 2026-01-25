#!/bin/bash
# notifications-microservice Application Deployment Script
# Usage: ./scripts/deploy.sh
#
# This script deploys the notifications-microservice application to production using the
# nginx-microservice blue/green deployment system.
#
# The script automatically detects the nginx-microservice location and
# calls the deploy-smart.sh script to perform the deployment.

set -e

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         notifications-microservice Application - Production Deployment         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Service name
SERVICE_NAME="notifications-microservice"

# Detect nginx-microservice path
# Try common production paths first, then fallback to relative path
NGINX_MICROSERVICE_PATH=""

# Check common production paths
if [ -d "/home/statex/nginx-microservice" ]; then
    NGINX_MICROSERVICE_PATH="/home/statex/nginx-microservice"
elif [ -d "/home/alfares/nginx-microservice" ]; then
    NGINX_MICROSERVICE_PATH="/home/alfares/nginx-microservice"
elif [ -d "$HOME/nginx-microservice" ]; then
    NGINX_MICROSERVICE_PATH="$HOME/nginx-microservice"
# Check if nginx-microservice is a sibling directory (for local dev)
elif [ -d "$(dirname "$PROJECT_ROOT")/nginx-microservice" ]; then
    NGINX_MICROSERVICE_PATH="$(dirname "$PROJECT_ROOT")/nginx-microservice"
# Check if nginx-microservice is in the same directory as beauty
elif [ -d "$PROJECT_ROOT/../nginx-microservice" ]; then
    NGINX_MICROSERVICE_PATH="$(cd "$PROJECT_ROOT/../nginx-microservice" && pwd)"
fi

# Validate nginx-microservice path
if [ -z "$NGINX_MICROSERVICE_PATH" ] || [ ! -d "$NGINX_MICROSERVICE_PATH" ]; then
    echo -e "${RED}❌ Error: nginx-microservice not found${NC}"
    echo ""
    echo "Please ensure nginx-microservice is installed in one of these locations:"
    echo "  - /home/statex/nginx-microservice"
    echo "  - /home/alfares/nginx-microservice"
    echo "  - $HOME/nginx-microservice"
    echo "  - $(dirname "$PROJECT_ROOT")/nginx-microservice (sibling directory)"
    echo ""
    echo "Or set NGINX_MICROSERVICE_PATH environment variable:"
    echo "  export NGINX_MICROSERVICE_PATH=/path/to/nginx-microservice"
    exit 1
fi

# Check if deploy-smart.sh exists
DEPLOY_SCRIPT="$NGINX_MICROSERVICE_PATH/scripts/blue-green/deploy-smart.sh"
if [ ! -f "$DEPLOY_SCRIPT" ]; then
    echo -e "${RED}❌ Error: deploy-smart.sh not found at $DEPLOY_SCRIPT${NC}"
    exit 1
fi

# Check if deploy-smart.sh is executable
if [ ! -x "$DEPLOY_SCRIPT" ]; then
    echo -e "${YELLOW}⚠️  Making deploy-smart.sh executable...${NC}"
    chmod +x "$DEPLOY_SCRIPT"
fi

echo -e "${GREEN}✅ Found nginx-microservice at: $NGINX_MICROSERVICE_PATH${NC}"
echo -e "${GREEN}✅ Deploying service: $SERVICE_NAME${NC}"
echo ""

# Timing and logging functions
get_timestamp() {
    date '+%Y-%m-%d %H:%M:%S.%3N'
}

get_timestamp_seconds() {
    date +%s.%N
}

log_with_timestamp() {
    local message="[$(get_timestamp)] $1"
    echo "$message" >&2
    echo "$message"
}

# Phase timing tracking using temp file (works in subshells)
PHASE_TIMING_FILE=$(mktemp /tmp/deploy-phases-XXXXXX)
trap "rm -f $PHASE_TIMING_FILE" EXIT

start_phase() {
    local phase_name="$1"
    local timestamp=$(get_timestamp_seconds)
    echo "$phase_name|START|$timestamp" >> "$PHASE_TIMING_FILE"
    local msg="⏱️  PHASE START: $phase_name"
    echo -e "${YELLOW}$msg${NC}" >&2
    echo -e "${YELLOW}$msg${NC}"
}

end_phase() {
    local phase_name="$1"
    local timestamp=$(get_timestamp_seconds)
    echo "$phase_name|END|$timestamp" >> "$PHASE_TIMING_FILE"
    
    # Calculate duration if we have start time
    local start_line=$(grep "^${phase_name}|START|" "$PHASE_TIMING_FILE" | tail -1)
    if [ -n "$start_line" ]; then
        local start_time=$(echo "$start_line" | cut -d'|' -f3)
        # Use awk for calculation (more portable than bc)
        local duration=$(awk "BEGIN {printf \"%.2f\", $timestamp - $start_time}")
        local msg="⏱️  PHASE END: $phase_name (duration: ${duration}s)"
        echo -e "${GREEN}$msg${NC}" >&2
        echo -e "${GREEN}$msg${NC}"
    fi
}

print_phase_summary() {
    # Check if file exists and has content
    if [ ! -f "$PHASE_TIMING_FILE" ] || [ ! -s "$PHASE_TIMING_FILE" ]; then
        echo ""
        echo -e "${YELLOW}⚠️  No phase timing data available${NC}"
        echo ""
        return
    fi
    
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}📊 DEPLOYMENT PHASE TIMING SUMMARY${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    
    # Process phase timings
    local current_phase=""
    local start_time=""
    local total_phase_time=0
    
    while IFS='|' read -r phase_name event timestamp; do
        if [ "$event" = "START" ]; then
            current_phase="$phase_name"
            start_time="$timestamp"
        elif [ "$event" = "END" ] && [ -n "$start_time" ] && [ -n "$current_phase" ]; then
            # Use awk for calculation (more portable than bc)
            local duration=$(awk "BEGIN {printf \"%.2f\", $timestamp - $start_time}")
            total_phase_time=$(awk "BEGIN {printf \"%.2f\", $total_phase_time + $duration}")
            printf "  ${GREEN}%-45s${NC} ${YELLOW}%10.2fs${NC}\n" "$phase_name:" "$duration"
            current_phase=""
            start_time=""
        fi
    done < "$PHASE_TIMING_FILE"
    
    if [ "$(echo "$total_phase_time > 0" | bc 2>/dev/null || echo "0")" = "1" ]; then
        echo -e "${BLUE}────────────────────────────────────────────────────────────${NC}"
        printf "  ${GREEN}%-45s${NC} ${YELLOW}%10.2fs${NC}\n" "Total (all phases):" "$total_phase_time"
    fi
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Change to nginx-microservice directory and run deployment
start_phase "Pre-deployment Setup"
log_with_timestamp "Starting blue/green deployment..."
echo -e "${YELLOW}Starting blue/green deployment...${NC}"
echo ""

log_with_timestamp "Changing directory to: $NGINX_MICROSERVICE_PATH"
cd "$NGINX_MICROSERVICE_PATH"

log_with_timestamp "About to execute: $DEPLOY_SCRIPT $SERVICE_NAME"
log_with_timestamp "Current directory: $(pwd)"
log_with_timestamp "Script exists and is executable: $([ -x "$DEPLOY_SCRIPT" ] && echo 'yes' || echo 'no')"
end_phase "Pre-deployment Setup"

# Execute the deployment script with phase tracking
log_with_timestamp "Executing deployment script now..."
START_TIME=$(get_timestamp_seconds)

# Create a wrapper to track phases from deployment script output
# Use a named pipe or process substitution to track phases
"$DEPLOY_SCRIPT" "$SERVICE_NAME" 2>&1 | {
    build_started=0
    start_containers_started=0
    health_check_started=0
    
    while IFS= read -r line; do
        # Echo the line to stdout
        echo "$line"
        
        # Track phases based on deployment script output patterns
        if echo "$line" | grep -qE "Phase 0:.*Infrastructure"; then
            start_phase "Phase 0: Infrastructure Check"
        elif echo "$line" | grep -qE "Phase 0 completed|✅ Phase 0 completed"; then
            end_phase "Phase 0: Infrastructure Check"
        elif echo "$line" | grep -qE "Phase 1:.*Preparing|Phase 1:.*Prepare"; then
            start_phase "Phase 1: Prepare Green Deployment"
        elif echo "$line" | grep -qE "Phase 1 completed|✅ Phase 1 completed"; then
            end_phase "Phase 1: Prepare Green Deployment"
        elif echo "$line" | grep -qE "Phase 2:.*Switching|Phase 2:.*Switch"; then
            start_phase "Phase 2: Switch Traffic to Green"
        elif echo "$line" | grep -qE "Phase 2 completed|✅ Phase 2 completed"; then
            end_phase "Phase 2: Switch Traffic to Green"
        elif echo "$line" | grep -qE "Phase 3:.*Monitoring|Phase 3:.*Monitor"; then
            start_phase "Phase 3: Monitor Health"
        elif echo "$line" | grep -qE "Phase 3 completed|✅ Phase 3 completed"; then
            end_phase "Phase 3: Monitor Health"
        elif echo "$line" | grep -qE "Phase 4:.*Verifying|Phase 4:.*Verify"; then
            start_phase "Phase 4: Verify HTTPS"
        elif echo "$line" | grep -qE "Phase 4 completed|✅ Phase 4 completed"; then
            end_phase "Phase 4: Verify HTTPS"
        elif echo "$line" | grep -qE "Phase 5:.*Cleaning|Phase 5:.*Cleanup"; then
            start_phase "Phase 5: Cleanup"
        elif echo "$line" | grep -qE "Phase 5 completed|✅ Phase 5 completed"; then
            end_phase "Phase 5: Cleanup"
        elif echo "$line" | grep -qE "Building containers|Image.*Building" && [ "$build_started" -eq 0 ]; then
            start_phase "Build Containers"
            build_started=1
        elif echo "$line" | grep -qE "All services built|✅ All services built" && [ "$build_started" -eq 1 ]; then
            end_phase "Build Containers"
            build_started=2
        elif echo "$line" | grep -qE "Starting containers|Container.*Starting" && [ "$start_containers_started" -eq 0 ]; then
            start_phase "Start Containers"
            start_containers_started=1
        elif echo "$line" | grep -qE "Container.*Started|Waiting.*services to start" && [ "$start_containers_started" -eq 1 ]; then
            end_phase "Start Containers"
            start_containers_started=2
        elif echo "$line" | grep -qE "Checking.*health|Health check" && [ "$health_check_started" -eq 0 ]; then
            start_phase "Health Checks"
            health_check_started=1
        elif echo "$line" | grep -qE "health check passed|✅.*health" && [ "$health_check_started" -eq 1 ]; then
            end_phase "Health Checks"
            health_check_started=2
        fi
    done
    exit ${PIPESTATUS[0]}
}

DEPLOY_EXIT_CODE=$?
END_TIME=$(get_timestamp_seconds)
TOTAL_DURATION=$(awk "BEGIN {printf \"%.2f\", $END_TIME - $START_TIME}")

# Ensure phase timing file is still accessible (don't remove it yet)
if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
    TOTAL_DURATION_FORMATTED=$(awk "BEGIN {printf \"%.2f\", $TOTAL_DURATION}")
    # Print summary before final message
    print_phase_summary 2>&1
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     ✅ Deployment completed successfully!                  ║${NC}"
    echo -e "${GREEN}║     Total deployment time: ${TOTAL_DURATION_FORMATTED}s    ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "The notifications-microservice application has been deployed using blue/green deployment."
    echo "Check the status with:"
    echo "  cd $NGINX_MICROSERVICE_PATH"
    echo "  ./scripts/status-all-services.sh"
    exit 0
else
    TOTAL_DURATION_FORMATTED=$(awk "BEGIN {printf \"%.2f\", $TOTAL_DURATION}")
    echo ""
    echo -e "${RED}════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo -e "${RED}   Failed after: ${TOTAL_DURATION_FORMATTED}s${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════${NC}"
    print_phase_summary
    echo ""
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║      ❌ Deployment failed!                                 ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Please check the error messages above and:"
    echo "  1. Verify nginx-microservice is properly configured"
    echo "  2. Check service registry file exists: $NGINX_MICROSERVICE_PATH/service-registry/$SERVICE_NAME.json"
    echo "  3. Review deployment logs"
    echo "  4. Check service health: cd $NGINX_MICROSERVICE_PATH && ./scripts/blue-green/health-check.sh"
    exit 1
fi
