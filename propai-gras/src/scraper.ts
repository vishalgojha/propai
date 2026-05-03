/**
 * PropAI GRAS - IGR Scraper with FREE Open Source CAPTCHA Strategy
 */

import * as dotenv from 'dotenv';
import path from 'path';
import * as readline from 'readline';
import Tesseract from 'tesseract.js';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

class CaptchaSolver {
  /**
   * Solve using Tesseract.js (Free & Open Source)
   * This runs locally without any API keys or payments.
   */
  async solveFree(imageSource: string | Buffer): Promise<string> {
    console.log('--- 🛡️  Free Open Source CAPTCHA solving started ---');
    console.log('Processing with Tesseract.js...');

    try {
      const { data: { text } } = await Tesseract.recognize(
        imageSource,
        'eng',
        { 
          // logger: m => console.log(m) // Optional: progress logs
        }
      );

      const cleanedText = text.replace(/[^a-zA-Z0-9]/g, '').trim();
      
      if (cleanedText.length < 3) {
        throw new Error('OCR result too short, likely failed to read clearly');
      }

      console.log(`✅ OCR Result: ${cleanedText}`);
      return cleanedText;
    } catch (error: any) {
      throw new Error(`Tesseract error: ${error.message}`);
    }
  }

  /**
   * Solve manually by user input (Absolute fallback)
   */
  async solveManual(): Promise<string> {
    console.log('\n--- ⌨️  Manual CAPTCHA Input Needed ---');
    console.log('Instructions: Tesseract failed. Please check the browser/image and type it.');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Please enter the CAPTCHA text: ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}

class IGRScraper {
  private solver = new CaptchaSolver();

  async run() {
    console.log('--- Starting IGR Scraper (Free Mode) ---');
    
    // In a real run, we would capture this from the IGR page.
    // For now, we point it to a sample URL or path if you have one, 
    // or simulate the logic flow.
    const sampleCaptchaUrl = "https://tesseract.projectnaptha.com/img/eng_bw.png"; 

    try {
      const solvedText = await this.solver.solveFree(sampleCaptchaUrl);
      console.log(`Final Solved Text: ${solvedText}`);
    } catch (err: any) {
      console.warn('Free OCR failed:', err.message);
      const manualText = await this.solver.solveManual();
      console.log(`Manual Input: ${manualText}`);
    }

    console.log('Proceeding to search navigation...');
  }
}

const scraper = new IGRScraper();
scraper.run().catch(console.error);
