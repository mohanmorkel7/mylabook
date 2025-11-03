/**
 * Updated test script to verify comprehensive ResizeObserver error handling
 * Run this in the browser console to test the global error suppression
 */

console.log('🧪 Testing enhanced ResizeObserver error handling...');

// Function to simulate various ResizeObserver loop errors
function simulateResizeObserverErrors() {
  console.log('🔍 Simulating ResizeObserver loop errors...');
  
  // Test 1: Standard Error object
  const error1 = new Error('ResizeObserver loop completed with undelivered notifications.');
  console.log('📝 Test 1: Standard Error object');
  
  try {
    throw error1;
  } catch (e) {
    // This should be caught by the global handler
    setTimeout(() => {
      window.dispatchEvent(new ErrorEvent('error', {
        error: e,
        message: e.message,
        filename: 'test-script.js',
        lineno: 1,
        colno: 1
      }));
    }, 100);
  }
  
  // Test 2: Promise rejection
  console.log('📝 Test 2: Promise rejection');
  setTimeout(() => {
    const rejectionError = new Error('ResizeObserver loop completed with undelivered notifications.');
    const event = new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.reject(rejectionError),
      reason: rejectionError
    });
    window.dispatchEvent(event);
  }, 200);
  
  // Test 3: String-based error
  console.log('📝 Test 3: String-based error');
  setTimeout(() => {
    const stringEvent = new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.reject('ResizeObserver loop completed with undelivered notifications.'),
      reason: 'ResizeObserver loop completed with undelivered notifications.'
    });
    window.dispatchEvent(stringEvent);
  }, 300);
  
  // Test 4: Console error suppression
  console.log('📝 Test 4: Console error suppression');
  setTimeout(() => {
    console.error('ResizeObserver loop completed with undelivered notifications.');
  }, 400);
  
  console.log('✅ ResizeObserver error simulation completed');
}

// Function to test the safe ResizeObserver creation
function testSafeResizeObserver() {
  console.log('🔍 Testing safe ResizeObserver creation...');
  
  if (typeof window.createSafeResizeObserver === 'function') {
    console.log('✅ createSafeResizeObserver function is available');
    
    // Test creating a safe observer
    try {
      const observer = window.createSafeResizeObserver((entries) => {
        console.log('📏 Safe ResizeObserver callback executed');
      });
      
      // Test observing the body element
      observer.observe(document.body);
      
      setTimeout(() => {
        observer.disconnect();
        console.log('✅ Safe ResizeObserver test completed');
      }, 1000);
      
    } catch (error) {
      console.error('❌ Safe ResizeObserver creation failed:', error);
    }
  } else {
    console.warn('⚠️ createSafeResizeObserver function not found on window object');
  }
}

// Function to test multiple rapid resize events (stress test)
function stressTestResizeObserver() {
  console.log('🔍 Starting ResizeObserver stress test...');
  
  const testElement = document.createElement('div');
  testElement.style.cssText = `
    position: fixed;
    top: -100px;
    left: -100px;
    width: 50px;
    height: 50px;
    background: red;
    z-index: -1;
  `;
  document.body.appendChild(testElement);
  
  let resizeCount = 0;
  const observer = new ResizeObserver(() => {
    resizeCount++;
    // Intentionally cause rapid layout changes
    testElement.style.width = `${50 + (resizeCount % 10)}px`;
    testElement.style.height = `${50 + (resizeCount % 10)}px`;
  });
  
  observer.observe(testElement);
  
  // Trigger rapid size changes
  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      testElement.style.width = `${50 + i}px`;
    }, i * 10);
  }
  
  // Cleanup after stress test
  setTimeout(() => {
    observer.disconnect();
    document.body.removeChild(testElement);
    console.log(`✅ Stress test completed. Resize events: ${resizeCount}`);
  }, 2000);
}

// Main test execution
console.log('🚀 Starting comprehensive ResizeObserver error handling tests...');

// Test 1: Error simulation
setTimeout(() => {
  simulateResizeObserverErrors();
}, 500);

// Test 2: Safe observer creation
setTimeout(() => {
  testSafeResizeObserver();
}, 1500);

// Test 3: Stress test
setTimeout(() => {
  stressTestResizeObserver();
}, 2500);

// Final summary
setTimeout(() => {
  console.log('🎉 Comprehensive ResizeObserver error handling tests completed!');
  console.log('✅ Check the console for "🔧 ResizeObserver loop detected and suppressed" messages');
  console.log('✅ No unhandled ResizeObserver errors should appear in the console');
  console.log('✅ The application should continue functioning normally');
}, 5000);

// Export test functions for manual testing
window.testResizeObserverHandling = {
  simulateErrors: simulateResizeObserverErrors,
  testSafeObserver: testSafeResizeObserver,
  stressTest: stressTestResizeObserver
};

console.log('💡 Available test functions:');
console.log('  - window.testResizeObserverHandling.simulateErrors()');
console.log('  - window.testResizeObserverHandling.testSafeObserver()');
console.log('  - window.testResizeObserverHandling.stressTest()');
