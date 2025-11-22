/**
 * Resamania Authentication Handler
 * Manages login sessions, token refresh, and cookie persistence
 */

import { type BrowserContext, type Page } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path'
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url'

// Load environment variables
dotenv.config();


const relativePath = (path: string) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, '..', path);
}



interface Config {
  resamania?: {
    login_url?: string;
    planning_url?: string;
  };
  username?: string;
  password?: string;
  user_agent?: string;
  headless?: boolean;
}

interface SessionData {
  cookies: Record<string, string>;
  storage_state: any;
  expires_at: string;
  login_method: string;
}

export class ResamaniaAuth {
  private config: Config;
  private sessionFile: string;
  private sessionData: SessionData | null;

  constructor(config?: Config) {
    this.config = config || this.loadConfig();
    this.sessionFile = relativePath('./data/resamania_session.json');
    this.sessionData = this.loadSession();
  }

  private loadConfig(): Config {
    // Load from JSON config if available
    const configPath = relativePath('./config.json')
    let config: Config = {};

    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch (error) {
        // Ignore errors
      }
    }

    // Add credentials from environment (no hardcoded fallback for security)
    config.username = process.env.RESAMANIA_USERNAME;
    config.password = process.env.RESAMANIA_PASSWORD;
    config.user_agent = process.env.USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    config.headless = process.env.HEADLESS_BROWSER?.toLowerCase() === 'true';

    return config;
  }

  private loadSession(): SessionData | null {
    try {
      if (existsSync(this.sessionFile)) {
        return JSON.parse(readFileSync(this.sessionFile, 'utf-8'));
      }
    } catch (error) {
      console.warn(`Could not load session: ${error}`);
    }
    return null;
  }

  // Commented out - not currently used
  // private _saveSession(): void {
  //   if (!this.sessionData) return;

  //   try {
  //     const dir = dirname(this.sessionFile);
  //     if (!existsSync(dir)) {
  //       mkdirSync(dir, { recursive: true });
  //     }
  //     writeFileSync(this.sessionFile, JSON.stringify(this.sessionData, null, 2));
  //     console.log('Session saved');
  //   } catch (error) {
  //     console.error(`Could not save session: ${error}`);
  //   }
  // }

  isAuthenticated(): boolean {
    if (!this.sessionData) {
      return false;
    }

    // Check token expiry
    if (this.sessionData.expires_at) {
      const expiresAt = new Date(this.sessionData.expires_at);
      if (new Date() >= expiresAt) {
        console.log('Session expired');
        return false;
      }
    }

    return true;
  }

  isOnLoginPage(page: Page): boolean {
    try {
      const url = page.url();

      // Check if URL contains login or oauth (covers both direct and redirect cases)
      if (url.toLowerCase().includes('login') || url.toLowerCase().includes('oauth')) {
        return true;
      }

      // Check if on api.resamania.com (login domain) instead of member.resamania.com
      if (url.includes('api.resamania.com')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async loginBrowser(page: Page, _context: BrowserContext): Promise<boolean> {
    console.log('Attempting browser login...');

    try {
      // Get login URL from config
      const loginUrl = this.config.resamania?.login_url;
      if (!loginUrl) {
        console.error('Login URL not found in config');
        return false;
      }

      if (!this.config.username || !this.config.password) {
        console.error('Username or password not set in environment');
        return false;
      }

      // Navigate to login page
      await page.goto(loginUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      // STEP 1: Fill in email
      console.log('Filling in login credentials...');
      await page.fill('input[type="text"]', this.config.username);
      await page.waitForTimeout(500);

      // STEP 2: Click button to proceed to password
      try {
        await page.click('button:has-text("password")', { timeout: 5000 });
      } catch {
        try {
          await page.click('button:has-text("mot de passe")', { timeout: 5000 });
        } catch {
          // Find any button after email input
          const buttons = await page.$$('button');
          for (const btn of buttons) {
            const text = (await btn.innerText()).toLowerCase();
            if (text.includes('password') || text.includes('mot de passe') || text.includes('fill')) {
              await btn.click();
              break;
            }
          }
        }
      }
      await page.waitForTimeout(1000);

      // STEP 3: Fill in password
      await page.fill('input[type="password"]', this.config.password);
      await page.waitForTimeout(500);

      // STEP 4: Click login button
      try {
        await page.click('button:has-text("Log")', { timeout: 5000 });
      } catch {
        try {
          await page.click('button[type="submit"]', { timeout: 5000 });
        } catch {
          // Find any submit button
          const buttons = await page.$$('button');
          for (const btn of buttons) {
            const text = (await btn.innerText()).toLowerCase();
            if (text.includes('log') || text.includes('connect') || text.includes('connexion') || text.includes('submit')) {
              await btn.click();
              break;
            }
          }
        }
      }
      await page.waitForTimeout(2000);

      // Wait for navigation after login
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      console.log(`Login successful, redirected to: ${page.url()}`);

      return true;
    } catch (error) {
      console.error(`Browser login error: ${error}`);
      if (error instanceof Error) {
        console.error(error.stack);
      }
      return false;
    }
  }

  getStorageState(): any | null {
    if (this.isAuthenticated() && this.sessionData?.storage_state) {
      return this.sessionData.storage_state;
    }
    return null;
  }
}
