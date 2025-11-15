#!/usr/bin/env python3
"""
Test script for notification-microservice Telegram integration
Tests the service from Python (like statex and crypto-ai-agent)
"""

import requests
import json
import os
import sys
from typing import Optional, Dict, Any

# Configuration
SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "https://notifications.statex.cz")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "694579866")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


def test_basic_telegram():
    """Test basic Telegram notification"""
    print("Test 1: Basic Telegram notification")
    print("-" * 50)
    
    payload = {
        "channel": "telegram",
        "type": "custom",
        "recipient": CHAT_ID,
        "message": "🧪 Python test - Basic Telegram notification"
    }
    
    try:
        response = requests.post(
            f"{SERVICE_URL}/notifications/send",
            json=payload,
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            result = response.json()
            print(f"✅ PASSED (HTTP {response.status_code})")
            print(json.dumps(result, indent=2))
            return True
        else:
            print(f"❌ FAILED (HTTP {response.status_code})")
            print(response.text)
            return False
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False


def test_telegram_with_keyboard():
    """Test Telegram notification with inline keyboard"""
    print("\nTest 2: Telegram with inline keyboard")
    print("-" * 50)
    
    payload = {
        "channel": "telegram",
        "type": "custom",
        "recipient": CHAT_ID,
        "message": "🧪 Python test - Message with inline keyboard",
        "inlineKeyboard": [
            [
                {
                    "text": "📊 View Dashboard",
                    "url": "https://statex.ai/dashboard"
                }
            ],
            [
                {
                    "text": "🤖 Test Button",
                    "url": "https://statex.ai"
                }
            ]
        ]
    }
    
    try:
        response = requests.post(
            f"{SERVICE_URL}/notifications/send",
            json=payload,
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            result = response.json()
            print(f"✅ PASSED (HTTP {response.status_code})")
            print(json.dumps(result, indent=2))
            return True
        else:
            print(f"❌ FAILED (HTTP {response.status_code})")
            print(response.text)
            return False
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False


def test_telegram_with_bot_token():
    """Test Telegram with per-request bot token"""
    if not BOT_TOKEN:
        print("\nTest 3: Skipped (no bot token provided)")
        return None
    
    print("\nTest 3: Telegram with per-request bot token")
    print("-" * 50)
    
    payload = {
        "channel": "telegram",
        "type": "custom",
        "recipient": CHAT_ID,
        "message": "🧪 Python test - With per-request bot token",
        "botToken": BOT_TOKEN
    }
    
    try:
        response = requests.post(
            f"{SERVICE_URL}/notifications/send",
            json=payload,
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            result = response.json()
            print(f"✅ PASSED (HTTP {response.status_code})")
            print(json.dumps(result, indent=2))
            return True
        else:
            print(f"❌ FAILED (HTTP {response.status_code})")
            print(response.text)
            return False
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False


def test_health_check():
    """Test health endpoint"""
    print("\nTest 4: Health check")
    print("-" * 50)
    
    try:
        response = requests.get(f"{SERVICE_URL}/health", timeout=5)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ PASSED (HTTP {response.status_code})")
            print(json.dumps(result, indent=2))
            return True
        else:
            print(f"❌ FAILED (HTTP {response.status_code})")
            print(response.text)
            return False
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False


def main():
    """Run all tests"""
    print("🧪 Testing Notification Microservice - Telegram Integration")
    print("=" * 60)
    print(f"Service URL: {SERVICE_URL}")
    print(f"Chat ID: {CHAT_ID}")
    print(f"Bot Token: {'Provided' if BOT_TOKEN else 'Using global'}")
    print("=" * 60)
    
    results = []
    
    # Run tests
    results.append(("Basic Telegram", test_basic_telegram()))
    results.append(("Telegram with Keyboard", test_telegram_with_keyboard()))
    results.append(("Telegram with Bot Token", test_telegram_with_bot_token()))
    results.append(("Health Check", test_health_check()))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result is True)
    failed = sum(1 for _, result in results if result is False)
    skipped = sum(1 for _, result in results if result is None)
    
    for test_name, result in results:
        status = "✅ PASSED" if result is True else "❌ FAILED" if result is False else "⏭️  SKIPPED"
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed} passed, {failed} failed, {skipped} skipped")
    
    if failed > 0:
        sys.exit(1)
    else:
        print("\n✅ All tests passed!")


if __name__ == "__main__":
    main()

