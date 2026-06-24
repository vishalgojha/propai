---
name: modify-whatsapp-login-flow
description: Approach for modifying WhatsApp-based login flow from code-entry to message-based authentication
source: auto-skill
extracted_at: '2026-06-24T02:32:17.187Z'
---

## Modifying WhatsApp Login Flow from Code Entry to Message-Based Authentication

When tasked with changing the login flow from requiring users to manually enter a challenge code sent via WhatsApp to simply sending any message to initiate login, I followed this approach:

### 1. Understand the Existing Flow First
Before making changes, I thoroughly examined:
- How the frontend requested login codes (`requestLoginLink` endpoint)
- How the frontend polled for login status (`loginStatus` endpoint with code parameter)
- How the backend validated codes and created sessions
- What UI elements displayed the code and instructions

### 2. Make Coordinated Backend Changes
**Modified `/auth/login-status` endpoint:**
- Changed from accepting a `code` parameter to accepting a `phone` parameter
- Implemented logic to find the most recent activation code for that phone number
- Check if that code has been activated (indicating user messaged the WhatsApp number)
- Return appropriate status: pending, authenticated, or expired
- Maintained backward compatibility with existing activation code table structure

### 3. Update Frontend Logic Completely
**Removed code-specific state:**
- Eliminated `challengeCode`, `challengeLink`, `challengeExpiresAt` state variables
- Kept only `challengeStatus` to track login state (idle, pending, authenticated, expired)

**Updated submission handler:**
- When user submits phone number, call `requestLoginLink` as before
- Instead of displaying a code, set `challengeStatus` to 'pending' and show instructions
- Removed manual polling loop in favor of React `useEffect` hook

**Implemented React-based polling:**
- Added `useEffect` hook that runs when `challengeStatus` is 'pending' and phone number exists
- Normalizes phone number and polls `/auth/login-status` with phone parameter
- On 'authenticated' status, creates user session and redirects
- On 'expired' status, shows error and resets state
- Continues polling every 2 seconds until status changes

### 4. Transform User Interface Elements
**Updated instructional content:**
- Changed "Your login code" display to "PropAI Assistant Number"
- Show formatted number: +91 7021045254
- Updated button text from "Get login code" to "Start Login"
- Modified all supporting text to instruct users to send any WhatsApp message
- Updated proof points: changed "Login method" from "WhatsApp code" to "WhatsApp message"
- Updated capabilities: changed "One-click access" description to reflect message-based flow

**Updated help section:**
- Changed header from "Verify on WhatsApp" to "Message on WhatsApp"
- Updated description to reflect messaging the assistant number to start login

### 5. Maintain Security and User Experience
**Preserved existing security mechanisms:**
- Still uses the same activation code system in the backend
- Still validates phone number ownership through existing services
- Still creates secure app sessions via tokens
- Still protects against expired requests

**Maintained familiar UX patterns:**
- Kept the same visual layout and styling
- Preserved loading states and error handling
- Maintained redirect behavior after successful login
- Kept the same polling interval for responsiveness

### 6. Testing Strategy
**Verification steps:**
- Built the Next.js application to catch TypeScript errors
- Verified no compilation errors in modified files
- Confirmed the development server started successfully
- Ensured all related imports and references were updated
- Validated that unused variables were removed to prevent build errors

### Key Principles Applied:
1. **Minimal Change Principle**: Modified only what was necessary to achieve the goal
2. **Backward Compatibility**: Didn't alter database structures or break existing API contracts unnecessarily
3. **User-Centric Design**: Focused on simplifying the user experience while maintaining security
4. **Reusability**: Leveraged existing polling and session mechanisms rather than reinventing
5. **Error Handling**: Preserved and adapted existing error handling for the new flow

This approach can be applied to similar scenarios where you want to replace code-based authentication with simpler message-based flows in WhatsApp-integrated applications.