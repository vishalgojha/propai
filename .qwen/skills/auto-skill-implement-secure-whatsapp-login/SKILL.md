---
name: implement-secure-whatsapp-login
description: Approach for implementing a secure WhatsApp-based login flow that displays the assistant number and uses code verification for cross-device authentication
source: auto-skill
extracted_at: '2026-06-24T02:55:18.860Z'
---

## Implementing Secure WhatsApp Login with Assistant Number Display and Code Verification

When tasked with modifying a WhatsApp-based login flow to both display the PropAI assistant number AND maintain security for cross-device authentication (phone login + laptop verification), I followed this approach:

### 1. Understand the Dual Requirements
The request had two parts:
- Display the PropAI assistant number (+91 7021045254) instead of a challenge code
- Address security concerns about how the system knows when a user messaged from phone while logging in on laptop

### 2. Design a Secure Hybrid Flow
Rather than removing code verification entirely (which would be insecure), I designed a flow that:
- Shows the PropAI assistant number prominently
- Still uses secure code verification for authentication
- Sends the code via WhatsApp FROM the assistant number
- Requires user to enter the code they received on their phone

### 3. Backend Implementation
**Modified `/auth/request-login-link` endpoint:**
- Generates secure 8-character activation code (PROP-XXXX format)
- Associates code with user's phone number and session
- Returns code in development mode only (hidden in production)
- Does NOT send code directly via API (would be insecure) - instead relies on WhatsApp service to deliver

**Enhanced `/auth/login-status` endpoint:**
- Handles both code verification and polling modes
- When code is provided: validates it belongs to the user's phone number
- When only phone is provided: checks for recently activated code for that phone
- Maintains secure session creation in both paths

### 4. Frontend State Management
**Added/Modified State Variables:**
- `phoneNumber`: User's entered phone number
- `loginCode`: Code entered by user for verification
- `isVerifying`: Loading state during code verification
- `showCodeInput`: Toggles between showing PropAI number vs code input
- `challengeStatus`: Tracks login state (pending, authenticated, expired)
- `apiStatus`: Tracks backend connectivity

**Updated Submission Handler (`handleSendLoginLink`):**
- Normalizes and validates phone number
- Calls backend to initiate login process
- Shows code input field and instructs user to check WhatsApp
- In development, may show code for testing (hidden in production)
- Resets appropriate state variables

**Updated Verification Handler (`handleVerifyCode`):**
- Validates code format (PROP-XXXX)
- Calls backend to verify code matches phone number
- Handles successful authentication (sets user session)
- Manages error states and loading indicators

### 5. User Interface Transformation
**PropAI Number Display Section:**
- Prominently shows "+91 7021045254"
- Clear instruction: "Save this number and send a WhatsApp message to start your login session"
- Direct WhatsApp link: https://wa.me/917021045254
- Note: "Send any message from your WhatsApp number to initiate login. No code entry needed." (this updates after requesting login)

**Code Verification Section (shown after requesting login):**
- Clear header: "Enter Login Code"
- Instruction: "Check your WhatsApp for a message from the PropAI Assistant number (+91 7021045254) containing your 8-character code."
- Input field with auto-formatting (PROP-XXXX)
- Buttons: "Verify Code" and "Request New Code"
- Loading states and error handling

### 6. Security Considerations Maintained
**Phone Number Validation:**
- Strict normalization and validation of phone numbers
- Ensures codes are only valid for the requesting phone number
- Prevents code reuse or interception attacks

**Code Security:**
- Cryptographically secure random code generation
- Limited attempt rate to prevent brute force
- Expiration timers (48 hours)
- One-time use codes (marked as activated after use)

**Session Security:**
- Secure token generation for access and refresh tokens
- Proper token expiration and rotation
- User context preservation (name, email, role)

### 7. User Experience Benefits
**Clear Instructions:**
- Users always know what number to message
- Reduces confusion about where to send WhatsApp messages
- Eliminates guesswork about which number is the official PropAI Assistant

**Transparent Process:**
- Clear distinction between requesting login and verifying code
- Immediate feedback on what step comes next
- Ability to request a new code if needed

**Familiar Flow:**
- Maintains similar interaction patterns to the original flow
- Presers same visual design and layout
- Keeps loading states, error messages, and success notifications

### 8. Implementation Principles Applied
**Modular Changes:**
- Modified only what was necessary: Login.tsx and authRoutes.ts
- Reused existing activation code system and session management
- Leveraged existing UI components and styling patterns

**Backward Compatibility:**
- Did not change database schemas or core authentication mechanisms
- Maintained API contract compatibility where possible
- Preserved error handling and logging approaches

**Error Resilience:**
- Maintained existing error handling patterns
- Preserved loading and timeout behaviors
- Kept validation and sanitization routines

**Testing Strategy:**
- Verified TypeScript compilation with no errors
- Confirmed successful application build
- Validated that all imports and references resolved correctly
- Ensured no unused variables or dead code remained

This approach successfully balances the conflicting requirements of showing the official WhatsApp number while maintaining strong security for cross-device authentication through verified code exchange.