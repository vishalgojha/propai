import { AgentGroundingService } from './grounding_service';

async function testAgentBrain() {
  const brain = new AgentGroundingService();
  
  console.log('--- 🧠 PropAI AI Agent Brain: Grounding Test ---');
  
  // Scenario: A user asks about a flat being sold for 10 Cr in Bandra West
  const brokerAsking = 100000000; // 10 Cr
  const area = 1250;
  const locality = "Bandra West";
  
  console.log(`User Input: A broker is asking ₹${(brokerAsking/10000000).toFixed(1)} Cr for 1250 sqft in ${locality}.`);
  
  const validation = await brain.validateClaim(brokerAsking, area, locality);
  
  console.log('\n--- AI Agent Reasoning ---');
  console.log(`Broker PSF: ₹${(brokerAsking/area).toLocaleString()}`);
  console.log(`GRAS Ground Truth PSF: ₹${validation.ground_truth_psf.toLocaleString()}`);
  console.log(`Inflation: ${validation.inflation_percentage}`);
  console.log(`AI Agent Advice: ${validation.advice}`);
  console.log('-------------------------------------------');
}

testAgentBrain().catch(console.error);
