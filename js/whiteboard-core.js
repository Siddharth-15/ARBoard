// js/whiteboard-core.js

class WhiteboardCore {
    constructor(canvasId, initialWidth, initialHeight, onDrawCallback) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with ID "${canvasId}" not found.`);
            return; 
        }
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }); // Added willReadFrequently
        if (!this.ctx) {
            console.error(`Failed to get 2D context for canvas "${canvasId}".`);
            return; 
        }
        this.onDrawCallback = onDrawCallback;

        this.isDrawing = false;
        this.currentTool = 'pen';
        this.currentColor = '#FFA500'; 
        this.currentSize = 5;
        this.currentFont = '16px Arial';

        this.currentPageIndex = 0;
        this.pages = [[]]; 
        this.undoStack = [[]]; 
        this.redoStack = [];

        this.lastX = 0;
        this.lastY = 0;
        this.startX = 0;
        this.startY = 0;
        this.snapshot = null;

        this.resizeCanvas(initialWidth, initialHeight);
        this._initEventListeners();
        console.log("WhiteboardCore initialized for canvas:", canvasId);
    }

    resizeCanvas(width, height) {
        if (!this.canvas || !this.ctx) return;

        const currentDrawingData = this.pages[this.currentPageIndex] ? JSON.parse(JSON.stringify(this.pages[this.currentPageIndex])) : [];
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        if (currentDrawingData.length > 0) {
            this.pages[this.currentPageIndex] = currentDrawingData;
            this.redrawCurrentPage();
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    _initEventListeners() {
        if (!this.canvas) return;
        this.canvas.addEventListener('mousedown', (e) => this._startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this._draw(e));
        this.canvas.addEventListener('mouseup', (e) => this._stopDrawing(e));
        this.canvas.addEventListener('mouseout', (e) => this._stopDrawingOnOut(e));

        this.canvas.addEventListener('touchstart', (e) => this._startDrawing(this._touchToMouseEvent(e, 'mousedown')), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this._draw(this._touchToMouseEvent(e, 'mousemove')), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this._stopDrawing(this._touchToMouseEvent(e, 'mouseup')));
        this.canvas.addEventListener('touchcancel', (e) => this._stopDrawing(this._touchToMouseEvent(e, 'mouseup')));
    }

    _touchToMouseEvent(e, eventName) {
        e.preventDefault();
        const touch = e.touches[0] || e.changedTouches[0];
        if (!touch) return null; 
        
        return new MouseEvent(eventName, {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0 
        });
    }

    _getMousePos(event) {
        if (!this.canvas) return { x: 0, y: 0 };
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (event.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    _startDrawing(e) {
        if (!e || (e.button !== 0 && e.type !== 'touchstart')) return;
        if (!this.ctx) return;

        this.isDrawing = true;
        const { x, y } = this._getMousePos(e);
        
        this.startX = x;
        this.startY = y;
        this.lastX = x;
        this.lastY = y;

        this.redoStack = [];

        if (this.currentTool === 'pen' || this.currentTool === 'marker' || this.currentTool === 'eraser') {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
        } else if (['line', 'rect', 'circle'].includes(this.currentTool)) {
            this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        } else if (this.currentTool === 'text') {
            this._placeText(x, y);
            this.isDrawing = false;
        }
    }

    _draw(e) {
        if (!this.isDrawing || !e) return;
        if (!this.ctx) return;

        const { x, y } = this._getMousePos(e);

        if (this.currentTool === 'pen' || this.currentTool === 'marker') {
            const actualSize = this.currentTool === 'marker' ? this.currentSize * 2 : this.currentSize;
            const actionData = { tool: this.currentTool, color: this.currentColor, size: actualSize, startX: this.lastX, startY: this.lastY, endX: x, endY: y };
            this._drawLine(this.lastX, this.lastY, x, y, this.currentColor, actualSize);
            this.pages[this.currentPageIndex].push(actionData);
            if (this.onDrawCallback) this.onDrawCallback(actionData);
        } else if (this.currentTool === 'eraser') {
            const actualSize = this.currentSize * 2;
            const actionData = { tool: this.currentTool, size: actualSize, startX: this.lastX, startY: this.lastY, endX: x, endY: y };
            this._eraseLine(this.lastX, this.lastY, x, y, actualSize);
            this.pages[this.currentPageIndex].push(actionData);
            if (this.onDrawCallback) this.onDrawCallback(actionData);
        } else if (['line', 'rect', 'circle'].includes(this.currentTool)) {
            if (this.snapshot) this.ctx.putImageData(this.snapshot, 0, 0);

            if (this.currentTool === 'line') {
                this._drawLine(this.startX, this.startY, x, y, this.currentColor, this.currentSize);
            } else if (this.currentTool === 'rect') {
                this._drawRect(this.startX, this.startY, x - this.startX, y - this.startY, this.currentColor, this.currentSize, false);
            } else if (this.currentTool === 'circle') {
                const radius = Math.hypot(x - this.startX, y - this.startY);
                this._drawCircle(this.startX, this.startY, radius, this.currentColor, this.currentSize, false);
            }
            return; 
        }

        this.lastX = x;
        this.lastY = y;
    }

    _stopDrawing(e) {
        if (!this.isDrawing && !(this.snapshot && ['line', 'rect', 'circle'].includes(this.currentTool))) {
            return;
        }
        if (!this.ctx) return;

        const finalPos = e ? this._getMousePos(e) : { x: this.lastX, y: this.lastY };

        if (this.currentTool === 'pen' || this.currentTool === 'marker' || this.currentTool === 'eraser') {
            if(this.isDrawing) this.ctx.closePath(); 
        } else if (['line', 'rect', 'circle'].includes(this.currentTool)) {
            if (this.snapshot) {
                this.ctx.putImageData(this.snapshot, 0, 0);
            }

            const actionData = {
                tool: this.currentTool, color: this.currentColor, size: this.currentSize,
                startX: this.startX, startY: this.startY,
                endX: finalPos.x,
                endY: finalPos.y
            };

            if (this.currentTool === 'line') {
                this._drawLine(actionData.startX, actionData.startY, actionData.endX, actionData.endY, actionData.color, actionData.size);
            } else if (this.currentTool === 'rect') {
                this._drawRect(actionData.startX, actionData.startY, actionData.endX - actionData.startX, actionData.endY - actionData.startY, actionData.color, actionData.size, false);
            } else if (this.currentTool === 'circle') {
                const radius = Math.hypot(actionData.endX - actionData.startX, actionData.endY - actionData.startY);
                if (radius > 0) { 
                    this._drawCircle(actionData.startX, actionData.startY, radius, actionData.color, actionData.size, false);
                } else { 
                    actionData.tool = 'dot'; 
                    actionData.radius = this.currentSize / 2;
                    this._drawCircle(actionData.startX, actionData.startY, actionData.radius, actionData.color, 0, true);
                }
            }
            
            this.pages[this.currentPageIndex].push(actionData);
            if (this.onDrawCallback) this.onDrawCallback(actionData);
            this.snapshot = null;
        }
        
        this.isDrawing = false;

        const lastUndoState = this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1] : null;
        const currentPageState = this.pages[this.currentPageIndex];
        if (!lastUndoState || JSON.stringify(lastUndoState) !== JSON.stringify(currentPageState)) {
            this.undoStack.push(JSON.parse(JSON.stringify(currentPageState)));
        }
    }

    _stopDrawingOnOut(e) {
        if (this.isDrawing) {
            if (['line', 'rect', 'circle'].includes(this.currentTool) && this.snapshot) {
                this._stopDrawing(e); 
            } else if (this.currentTool === 'pen' || this.currentTool === 'marker' || this.currentTool === 'eraser') {
                this.ctx.closePath();
                this.isDrawing = false;
                const lastUndoState = this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1] : null;
                const currentPageState = this.pages[this.currentPageIndex];
                if (!lastUndoState || JSON.stringify(lastUndoState) !== JSON.stringify(currentPageState)) {
                   this.undoStack.push(JSON.parse(JSON.stringify(currentPageState)));
                }
            }
        }
    }

    _drawLine(x1, y1, x2, y2, color, lineWidth) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        this.ctx.closePath();
    }

    _eraseLine(x1, y1, x2, y2, lineWidth) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        let canvasBgColor = '#ffffff'; 
        try {
            const canvasArea = this.canvas.parentElement;
            const computedStyle = canvasArea ? getComputedStyle(canvasArea) : null;
            canvasBgColor = this.canvas.style.backgroundColor || 
                            (computedStyle ? computedStyle.backgroundColor : null) || 
                            (document.documentElement.getAttribute('data-theme') === 'dark' ? '#282c34' : '#ffffff');
            if (canvasBgColor === 'rgba(0, 0, 0, 0)' || canvasBgColor === 'transparent') {
                canvasBgColor = (document.documentElement.getAttribute('data-theme') === 'dark' ? '#282c34' : '#ffffff');
            }
        } catch (error) {
            console.warn("Could not determine canvas background for eraser, defaulting.", error);
        }

        this.ctx.strokeStyle = canvasBgColor;
        this.ctx.lineWidth = lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.stroke();
        this.ctx.closePath();
        this.ctx.globalCompositeOperation = 'source-over';
    }

    _drawRect(x, y, w, h, color, lineWidth, fill) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        if (fill) {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, y, w, h);
        } else {
            this.ctx.strokeRect(x, y, w, h);
        }
        this.ctx.closePath();
    }

    _drawCircle(x, y, radius, color, lineWidth, fill) {
        radius = Math.max(0, radius); 
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        if (fill) {
            this.ctx.fillStyle = color;
            this.ctx.fill();
        } else {
            this.ctx.stroke();
        }
        this.ctx.closePath();
    }

    _placeText(x, y) {
        const text = prompt("Enter text:", "");
        if (text) {
            const actionData = {
                tool: 'text', text: text, x: x, y: y,
                font: this.currentFont, color: this.currentColor
            };
            this._drawText(text, x, y, this.currentFont, this.currentColor);
            this.pages[this.currentPageIndex].push(actionData);
            if (this.onDrawCallback) this.onDrawCallback(actionData);
            this.undoStack.push(JSON.parse(JSON.stringify(this.pages[this.currentPageIndex])));
        }
    }

    _drawText(text, x, y, font, color) {
        this.ctx.font = font;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(text, x, y);
    }

    setTool(tool) { this.currentTool = tool; }
    setColor(color) { this.currentColor = color; }
    setSize(size) { this.currentSize = parseInt(size, 10) || 1; }
    setFont(font) { this.currentFont = font; } 

    clearCanvas() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.pages[this.currentPageIndex] = [];
        this.undoStack = [[]]; 
        this.redoStack = [];
        if (this.onDrawCallback) this.onDrawCallback({ tool: 'clear', pageIndex: this.currentPageIndex });
    }

    undo() {
        if (this.undoStack.length <= 1) return; 

        this.redoStack.push(this.undoStack.pop()); 
        const prevState = JSON.parse(JSON.stringify(this.undoStack[this.undoStack.length - 1]));
        this.pages[this.currentPageIndex] = prevState;
        this.redrawCurrentPage();
        if (this.onDrawCallback) this.onDrawCallback({ tool: 'load_state', state: prevState, pageIndex: this.currentPageIndex });
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const nextState = this.redoStack.pop();
        this.undoStack.push(JSON.parse(JSON.stringify(nextState)));
        this.pages[this.currentPageIndex] = JSON.parse(JSON.stringify(nextState));
        this.redrawCurrentPage();
        if (this.onDrawCallback) this.onDrawCallback({ tool: 'load_state', state: nextState, pageIndex: this.currentPageIndex });
    }

    addPage() {
        if (!this.pages) {
            console.error("WhiteboardCore: this.pages is undefined in addPage!");
            this.pages = [];
        }
        this.pages.push([]); 
        this.currentPageIndex = this.pages.length - 1;
        console.log(`WhiteboardCore: Before clearCanvasForNewPage. Current page index: ${this.currentPageIndex}`);
        this.clearCanvasForNewPage(); 
        this.undoStack = [[]]; 
        this.redoStack = [];
        console.log(`WhiteboardCore: Page added. New index: ${this.currentPageIndex}. Total pages: ${this.pages.length}. Current page data:`, JSON.stringify(this.pages[this.currentPageIndex]));
        
        if (this.onDrawCallback) {
            this.onDrawCallback({ 
                tool: 'add_page', 
                newPageIndex: this.currentPageIndex, 
                totalPages: this.pages.length 
            });
        }
        return this.currentPageIndex;
    }

    // js/whiteboard-core.js
    // ... (other methods) ...
    switchToPage(pageIndex) {
        if (pageIndex >= 0 && pageIndex < this.pages.length) {
            // Condition to proceed if it's a new page index OR if it's the same page but needs a forced refresh (e.g., after loadAllPagesData)
            if (pageIndex !== this.currentPageIndex || (pageIndex === this.currentPageIndex && this.pages[this.currentPageIndex])) {
                this.currentPageIndex = pageIndex;
                this.redrawCurrentPage();
                // Reset undo/redo for the newly active page, starting with its current state
                this.undoStack = [JSON.parse(JSON.stringify(this.pages[this.currentPageIndex] || []))];
                this.redoStack = [];
                console.log(`WhiteboardCore: Switched to page ${this.currentPageIndex} (or refreshed view).`);
                if (this.onDrawCallback) {
                    this.onDrawCallback({ tool: 'switch_page', pageIndex: this.currentPageIndex });
                }
            } else if (pageIndex === this.currentPageIndex) {
                // console.log(`WhiteboardCore: Already on page ${this.currentPageIndex} and no content to force refresh. No switch needed.`);
            }
        } else {
            console.warn(`WhiteboardCore: Invalid page index for switch: ${pageIndex}. Total pages: ${this.pages.length}`);
        }
    }
    // ... (other methods) ...
    
    clearCanvasForNewPage() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    redrawCurrentPage() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawActions(this.pages[this.currentPageIndex]);
    }

    drawActions(actionsArray) {
        if (!actionsArray || !this.ctx) return;
        actionsArray.forEach(action => {
            if (!action || !action.tool) return; 

            if (action.tool === 'pen' || action.tool === 'marker') {
                this._drawLine(action.startX, action.startY, action.endX, action.endY, action.color, action.size);
            } else if (action.tool === 'eraser') {
                this._eraseLine(action.startX, action.startY, action.endX, action.endY, action.size);
            } else if (action.tool === 'line') {
                this._drawLine(action.startX, action.startY, action.endX, action.endY, action.color, action.size);
            } else if (action.tool === 'rect') {
                this._drawRect(action.startX, action.startY, action.endX - action.startX, action.endY - action.startY, action.color, action.size, false);
            } else if (action.tool === 'circle') {
                const radius = Math.hypot(action.endX - action.startX, action.endY - action.startY);
                 if (radius > 0) this._drawCircle(action.startX, action.startY, radius, action.color, action.size, false);
                 else this._drawCircle(action.startX, action.startY, action.size / 2, action.color, 0, true);
            } else if (action.tool === 'text') {
                this._drawText(action.text, action.x, action.y, action.font, action.color);
            } else if (action.tool === 'dot') { 
                this._drawCircle(action.startX, action.startY, action.radius || action.size / 2, action.color, 0, true);
            } else if (action.tool === 'clear') {
                 this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            }
            else if (action.tool === 'load_state' && action.pageIndex === this.currentPageIndex) {
                if (action.state) {
                    this.loadPageData(action.state);
                }
            }
        });
    }

    getCanvasDataURL() {
        return this.canvas ? this.canvas.toDataURL() : null;
    }

    getCurrentPageData() {
        return this.pages[this.currentPageIndex] || [];
    }

    loadPageData(pageData) { 
        this.pages[this.currentPageIndex] = JSON.parse(JSON.stringify(pageData || []));
        this.undoStack = [JSON.parse(JSON.stringify(this.pages[this.currentPageIndex]))];
        this.redoStack = [];
        this.redrawCurrentPage();
    }

    getAllPagesData() {
        return this.pages;
    }

    loadAllPagesData(allPagesData) { 
        this.pages = JSON.parse(JSON.stringify(allPagesData && allPagesData.length > 0 ? allPagesData : [[]]));
        this.currentPageIndex = 0; 
        this.switchToPage(this.currentPageIndex);
    }
}