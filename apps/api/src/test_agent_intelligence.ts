import { agentExecutor } from './services/AgentExecutor';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testIntelligenceIntegration() {
    console.log('--- 🧠 Testing Agent + GRAS Intelligence Integration ---');
    
    const tenantId = 'test-tenant';
    const remoteJid = '919000000000@s.whatsapp.net';
    const userMessage = "Hey, what's the latest rate for sales in DLH Signature? Is it a good investment?";

    console.log(`User: ${userMessage}`);
    
    // This will trigger the AgentExecutor loop
    // 1. AI will see "DLH Signature" and "sales"
    // 2. AI will call TOOL: get_market_intelligence { building_name: "DLH Signature", type: "sale" }
    // 3. AgentExecutor will call MarketIntelligenceService.getGroundTruth
    // 4. Result will be fed back to AI to give the final answer
    
    const response = await agentExecutor.processMessage(tenantId, remoteJid, userMessage);
    
    console.log('\n--- Agent Final Response ---');
    console.log(response);
    console.log('-------------------------------------------');
}

testIntelligenceIntegration().catch(console.error);
