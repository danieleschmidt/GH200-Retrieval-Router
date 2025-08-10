/**
 * Debug health check issues
 */

const { initializeRouter } = require('./src/index');

async function debugHealthChecks() {
    console.log('Initializing router...');
    
    try {
        const router = await initializeRouter();
        
        console.log('Router initialized successfully');
        console.log('Router initialized flag:', router.initialized);
        console.log('Router has memoryManager:', !!router.memoryManager);
        console.log('Router has vectorDatabase:', !!router.vectorDatabase);
        
        if (router.memoryManager) {
            console.log('Memory manager initialized flag:', router.memoryManager.initialized);
            const memoryHealth = await router.memoryManager.healthCheck();
            console.log('Memory manager health:', JSON.stringify(memoryHealth, null, 2));
        }
        
        if (router.vectorDatabase) {
            console.log('Vector database initialized flag:', router.vectorDatabase.initialized);
            const dbHealth = await router.vectorDatabase.healthCheck();
            console.log('Vector database health:', JSON.stringify(dbHealth, null, 2));
        }
        
        const routerHealth = await router.healthCheck();
        console.log('Router health:', JSON.stringify(routerHealth, null, 2));
        
        await router.shutdown();
        console.log('Router shutdown complete');
        
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

debugHealthChecks();