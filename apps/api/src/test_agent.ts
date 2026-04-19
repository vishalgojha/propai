import { AgentExecutor } from './services/AgentExecutor';
import { supabase } from './config/supabase';

async function testAgent() {
    const executor = new AgentExecutor();
    const tenantId = 'some-test-uuid'; // Replace with real uuid if needed
    const remoteJid = '1234567890@g.us';
    const listingText = "Available now: 3 BHK Luxury Apartment in Sector 62, Gurgaon. Price 2.5Cr. Carpet area 1500 sqft. Semi-furnished. Ready to move. Contact 9876543210";

    console.log('--- Testing Agent Execution Loop ---');
    console.log('Input:', listingText);

    try {
        const response = await executor.processMessage(tenantId, remoteJid, listingText);
        console.log('AI Response:', response);
    } catch (error) {
        console.error('Test Failed:', error);
    }
}

testAgent();
