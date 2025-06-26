// js/ar-integration.js
console.log("ar-integration.js: File loaded.");

class ARIntegration {
    constructor(whiteboardCanvasElement, onExitARCallback) {
        this.whiteboardCanvasElement = whiteboardCanvasElement; // The 2D HTML canvas to be textured
        this.onExitARCallback = onExitARCallback;
        this.isAREnabled = false;

        // DOM Elements
        this.arPopup = document.getElementById('arModePopup');
        this.exitArBtn = document.getElementById('exitArButton');
        this.arRenderCanvas = document.getElementById('arRenderCanvas'); // 8th Wall renders here

        // 8th Wall & Three.js specific variables
        this.threeScene = null;
        this.threeCamera = null;
        this.threeRenderer = null;
        this.arWhiteboardMesh = null;
        this.arCanvasTexture = null;
        this.isPlacementListenerActive = false;

        if (!this.arRenderCanvas) {
            console.error("ARIntegration Error: #arRenderCanvas element not found in HTML. This is required by 8th Wall.");
        }
        if (!this.whiteboardCanvasElement) {
            console.error("ARIntegration Error: whiteboardCanvasElement (the 2D canvas) was not provided.");
        }

        // The 'enterArBtn' listener is now set up in session-ui.js
        // This class only handles what happens *after* startARSession is called.
        if (this.exitArBtn) {
            this.exitArBtn.addEventListener('click', () => this.exitARSession());
        } else {
            console.warn("ARIntegration: Exit AR button not found.");
        }
    }

    _showARLoadingPopup(show) {
        if (this.arPopup) {
            this.arPopup.style.display = show ? 'block' : 'none';
        }
    }

    async startARSession() {
        if (this.isAREnabled) {
            console.log("ARIntegration: AR session already enabled.");
            return;
        }
        if (!this.arRenderCanvas || !this.whiteboardCanvasElement) {
            alert("AR components not ready. Cannot start AR session.");
            console.error("ARIntegration: Missing canvas elements for AR.");
            return;
        }
        if (!window.XR8 || !window.THREE) { // Check for 8th Wall and Three.js
            alert("AR library (8th Wall or Three.js) not loaded. Cannot start AR.");
            console.error("ARIntegration: XR8 or THREE.js global objects not found.");
            return;
        }

        console.log("ARIntegration: Attempting to start AR session...");
        this._showARLoadingPopup(true);
        document.body.classList.add('ar-active'); // For CSS to hide/show elements
        if (this.exitArBtn) this.exitArBtn.classList.remove('d-none');
        this.arRenderCanvas.style.display = 'block'; // Make the AR canvas visible


        // --- 8th Wall Specific Initialization ---
        try {
            const onxrloaded = () => {
                console.log("ARIntegration: XR8 onxrloaded event fired.");
                XR8.XrController.configure({
                    disableWorldTracking: false, // Enable SLAM for world tracking
                    // For more options, see 8th Wall docs:
                    // https://www.8thwall.com/docs/web/#xrcontrollerconfigureoptions
                });

                XR8.addCameraPipelineModules([
                    XR8.GlTextureRenderer.pipelineModule(), // Draws the camera feed.
                    XR8.Threejs.pipelineModule(),          // Creates and manages a ThreeJS AR Scene.
                    XR8.XrController.pipelineModule(),     // Handles SLAM tracking, camera motion, and hit testing.
                    // XR8.प्लेसमेंट.pipelineModule(), // (Optional) 8th Wall's newer placement module if you prefer it.
                    this, // Add this ARIntegration instance as a pipeline module
                ]);

                // Open the camera and start running the camera run loop.
                XR8.run({ canvas: this.arRenderCanvas });
                console.log("ARIntegration: XR8.run() initiated.");
                // isAREnabled will be set in on realtà in a moment.
            };

            // Check if XR8 is already loaded or wait for the event.
            if (XR8.isRealityReady()) {
                 console.log("ARIntegration: XR8 reality is already ready.");
                onxrloaded();
            } else {
                console.log("ARIntegration: Waiting for xrloaded event...");
                window.addEventListener('xrloaded', onxrloaded, { once: true });
            }
        } catch (error) {
            console.error("ARIntegration: Error during XR8 setup:", error);
            alert("Failed to initialize AR. Please check console for details.");
            this._resetAndExit();
        }
    }

    // --- 8th Wall Pipeline Module Lifecycle Methods ---
    // These are called by XR8 if `this` is added as a pipeline module.

    onRealityReady() { // Called when XR8's reality (camera, tracking) is ready
        console.log("ARIntegration: XR8 onRealityReady(). AR system is live.");
        this.isAREnabled = true;
        this._showARLoadingPopup(false); // Hide "Entering AR..." popup
        alert("AR Ready! Tap on a flat surface to place the whiteboard."); // User instruction
    }

    onAttach() { // Called when the XR8.Threejs.pipelineModule is ready and provides the scene.
        console.log("ARIntegration: onAttach() - Three.js scene is available.");
        if (!XR8.Threejs) {
            console.error("ARIntegration: XR8.Threejs is not available onAttach. Critical error.");
            return;
        }

        const { scene, camera, renderer } = XR8.Threejs.xrScene();
        this.threeScene = scene;
        this.threeCamera = camera; // This is the AR camera managed by 8th Wall
        this.threeRenderer = renderer; // The renderer managed by 8th Wall

        // Create a texture from our 2D whiteboard canvas
        this.arCanvasTexture = new THREE.CanvasTexture(this.whiteboardCanvasElement);
        this.arCanvasTexture.minFilter = THREE.LinearFilter;
        this.arCanvasTexture.magFilter = THREE.LinearFilter;
        // this.arCanvasTexture.needsUpdate = true; // Will be set in onUpdate

        // Create a plane geometry for the whiteboard
        const whiteboardWidth = 1.6;  // Approx. 1.6 meters wide in AR
        const whiteboardHeight = 0.9; // Approx. 0.9 meters high (16:9 aspect ratio)
        const geometry = new THREE.PlaneGeometry(whiteboardWidth, whiteboardHeight);
        
        const material = new THREE.MeshBasicMaterial({
            map: this.arCanvasTexture,
            transparent: true,      // If your canvas might have transparent parts
            side: THREE.DoubleSide, // So it's visible from both sides
            alphaTest: 0.01         // Helps with semi-transparent edges from canvas aliasing
        });

        this.arWhiteboardMesh = new THREE.Mesh(geometry, material);
        this.arWhiteboardMesh.visible = false; // Initially hidden
        this.threeScene.add(this.arWhiteboardMesh);

        // Add basic lighting if not using 8th Wall's default lighting extensively
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.threeScene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(1, 1, 1).normalize();
        this.threeScene.add(directionalLight);

        console.log("ARIntegration: Whiteboard AR mesh created and added to Three.js scene.");
        this._activatePlacementListener();
    }

    onUpdate() { // Called every frame by the XR8 pipeline
        if (this.isAREnabled && this.arCanvasTexture) {
            this.arCanvasTexture.needsUpdate = true; // CRITICAL: This updates the AR texture from the 2D canvas
        }
        // The XR8.Threejs.pipelineModule handles the rendering of the scene.
    }

    _activatePlacementListener() {
        if (this.isPlacementListenerActive || !this.arRenderCanvas) return;
        console.log("ARIntegration: Activating placement listener.");
        this.arRenderCanvas.addEventListener('click', this._handleARPlacement.bind(this), { once: true });
        this.isPlacementListenerActive = true;
    }

    _handleARPlacement(event) {
        this.isPlacementListenerActive = false; // Listener was {once: true} but reset if placement fails

        if (!this.isAREnabled || !this.arWhiteboardMesh || !XR8.XrController || !this.threeCamera) {
            console.warn("ARIntegration: Cannot place whiteboard, AR not fully ready or mesh missing.");
            this._activatePlacementListener(); // Re-enable listener if it failed early
            return;
        }
        console.log("ARIntegration: _handleARPlacement called by tap.");

        const { clientX, clientY } = event;
        const normalizedX = (clientX / this.arRenderCanvas.clientWidth) * 2 - 1;
        const normalizedY = -(clientY / this.arRenderCanvas.clientHeight) * 2 + 1;

        const hitTestResults = XR8.XrController.hitTest(normalizedX, normalizedY, [
            XR8.XrController.HitTestTrackableType.POINT,
            XR8.XrController.HitTestTrackableType.PLANE_HORIZONTAL, // Prioritize horizontal planes
            XR8.XrController.HitTestTrackableType.PLANE_VERTICAL,
            XR8.XrController.HitTestTrackableType.ESTIMATED_HORIZONTAL_PLANE,
            XR8.XrController.HitTestTrackableType.ESTIMATED_VERTICAL_PLANE,
        ]);

        if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            
            this.arWhiteboardMesh.position.copy(hit.position);
            this.arWhiteboardMesh.rotation.copy(hit.rotation);
            
            // Optional: Slightly lift the whiteboard if it's on a horizontal plane
            if (hit.type === XR8.XrController.HitTestTrackableType.PLANE_HORIZONTAL || 
                hit.type === XR8.XrController.HitTestTrackableType.ESTIMATED_HORIZONTAL_PLANE) {
                this.arWhiteboardMesh.position.y += 0.05; // Lift 5cm
            }
            // Optional: Orient towards the camera after placement (can be jarring if surface rotation is good)
            // this.arWhiteboardMesh.lookAt(this.threeCamera.position);

            this.arWhiteboardMesh.visible = true;
            console.log("ARIntegration: Whiteboard placed successfully at:", hit.position);
            // Listener was {once: true}, so it's automatically removed.
        } else {
            console.log("ARIntegration: No surface found for placement. Tap again on a clear surface.");
            alert("No surface detected. Please point your camera at a flat surface and tap again.");
            this._activatePlacementListener(); // Re-activate listener for another try
        }
    }

    _resetAndExit() { // Helper to reset UI state and call exit callback
        document.body.classList.remove('ar-active');
        if (this.exitArBtn) this.exitArBtn.classList.add('d-none');
        this._showARLoadingPopup(false);
        if (this.arRenderCanvas) this.arRenderCanvas.style.display = 'none';
        this.isAREnabled = false;

        if (this.onExitARCallback) {
            this.onExitARCallback();
        }
    }

    exitARSession() {
        if (!this.isAREnabled) {
            console.log("ARIntegration: AR session not enabled, nothing to exit.");
            return;
        }
        console.log("ARIntegration: Exiting AR session...");

        if (window.XR8 && XR8.isRealityActive()) {
            XR8.stop(); // Stop 8th Wall session processing
            console.log("ARIntegration: XR8.stop() called.");
        }

        // Clean up Three.js resources
        if (this.arWhiteboardMesh) {
            if (this.threeScene) this.threeScene.remove(this.arWhiteboardMesh);
            if (this.arWhiteboardMesh.geometry) this.arWhiteboardMesh.geometry.dispose();
            if (this.arWhiteboardMesh.material) {
                if (this.arWhiteboardMesh.material.map) this.arWhiteboardMesh.material.map.dispose();
                this.arWhiteboardMesh.material.dispose();
            }
        }
        this.arWhiteboardMesh = null;
        if (this.arCanvasTexture) this.arCanvasTexture.dispose();
        this.arCanvasTexture = null;
        
        // XR8.Threejs pipeline usually manages scene/camera/renderer destruction with XR8.stop()
        // but nullifying them here is good practice for our class state.
        this.threeScene = null;
        this.threeCamera = null;
        this.threeRenderer = null;

        this._resetAndExit();
        console.log("ARIntegration: AR session exited and resources cleaned up.");
    }
}