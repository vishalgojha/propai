---
name: adapt-whatsapp-login-for-mcp
description: Adapt the WhatsApp-based login flow used in the web application for MCP authentication
source: auto-skill
extracted_at: 2026-06-24T03:22:15.844Z
---

When adapting the WhatsApp-based login flow from the web application for MCP (Model Context Protocol) authentication, follow the pattern established in the web app login flow but adapt it for the MCP/OAuth 2.1 Device Authorization Grant flow.

**Why:** The web application successfully implements a secure WhatsApp-based login flow where users enter their phone number, receive a code via WhatsApp from the PropAI number, and enter that code on the website. This same secure approach can be adapted for MCP authentication using the OAuth 2.1 Device Authorization Grant flow, providing a consistent user experience across platforms.

**How to apply:**
1. **Understand the MCP Device Authorization Grant flow:**
   - MCP client (MCP client app) requests a device code from the MCP server
   - MCP server generates a device code and user code, returns them to client
   - MCP client displays the user code and instructs user to complete authentication on a separate device
   - User completes authentication on separate device (via WhatsApp flow)
   - MCP client polls for token using device code
   - MCP server validates and returns access token

2. **Adapt the WhatsApp login flow for device authorization:**
   - When MCP server receives device code request, generate a secure code
   - Instead of displaying code to user in MCP client, send code via WhatsApp from PropAI number (+91 7021045254)
   - Provide user with instructions to send a WhatsApp message to the PropAI number containing the code
   - Use webhook system to detect when user sends the code via WhatsApp
   - Associate the received code with the device code request
   - When polling for token, validate that the device code has been verified via WhatsApp

3. **Key adaptations from web flow:**
   - MCP client shows: "Open WhatsApp and send message '[CODE]' to +91 7021045254 to complete authentication"
   - Instead of web form for code entry, user sends WhatsApp message
   - Webhook handler validates received message matches expected code for pending device authorization
   - MCP token endpoint validates device code has been verified via WhatsApp before issuing token

4. **Security considerations maintained:**
   - Code is generated server-side and sent via official WhatsApp Cloud API
   - Code is single-use and time-limited
   - Code validation ensures it matches the pending device authorization request
   - Same PropAI WhatsApp number used for consistency and trust

5. **Implementation steps:**
   - Modify MCP server's device authorization endpoint to generate code and trigger WhatsApp message
   - Implement webhook handler to verify incoming WhatsApp messages match pending device codes
   - Modify token endpoint to check WhatsApp verification before granting token
   - Update MCP client instructions to show WhatsApp verification instructions
   - Maintain same security practices as web implementation (code expiration, rate limiting, etc.)

This approach leverages the proven secure WhatsApp login flow while adapting it to the MCP OAuth 2.1 Device Authorization Grant framework, providing a consistent and secure authentication experience across PropAI's platforms.