export type CircuitState = 'closed' | 'open' | 'half-open';

export type CircuitBreakerConfig = {
    threshold: number;
    timeout: number;
};

export class CircuitBreaker {
    public state: CircuitState = 'closed';
    public failureCount = 0;
    public lastFailureTime = 0;
    
    private readonly config: CircuitBreakerConfig;
    private halfOpenTimer: NodeJS.Timeout | null = null;

    constructor(config?: Partial<CircuitBreakerConfig>) {
        this.config = {
            threshold: config?.threshold ?? 5,
            timeout: config?.timeout ?? 60000,
        };
    }

    recordSuccess(): void {
        this.state = 'closed';
        this.failureCount = 0;
    }

    recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failureCount >= this.config.threshold) {
            this.state = 'open';
            console.log(`[CircuitBreaker] OPEN after ${this.failureCount} failures`);
        }
    }

    canAttempt(): boolean {
        if (this.state === 'closed') return true;
        
        if (this.state === 'open') {
            const timeSinceFailure = Date.now() - this.lastFailureTime;
            if (timeSinceFailure >= this.config.timeout) {
                this.state = 'half-open';
                console.log('[CircuitBreaker] Transitioning to HALF-OPEN');
                return true;
            }
            return false;
        }
        
        // Half-open: allow one attempt
        return true;
    }

    getStatus() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            timeSinceLastFailure: this.lastFailureTime > 0 
                ? Date.now() - this.lastFailureTime 
                : 0,
        };
    }

    reset(): void {
        this.state = 'closed';
        this.failureCount = 0;
        this.lastFailureTime = 0;
        if (this.halfOpenTimer) {
            clearTimeout(this.halfOpenTimer);
            this.halfOpenTimer = null;
        }
    }
}
