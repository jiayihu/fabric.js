(function() {

  var clone = fabric.util.object.clone;

  fabric.util.object.extend(fabric.IText.prototype, /** @lends fabric.IText.prototype */ {

    /**
     * Initializes all the interactive behavior of IText
     */
    initBehavior: function() {
      this.initAddedHandler();
      this.initRemovedHandler();
      this.initCursorSelectionHandlers();
      this.initDoubleClickSimulation();
      this.mouseMoveHandler = this.mouseMoveHandler.bind(this);
      this.dragOverHandler = this.dragOverHandler.bind(this);
      this.dragLeaveHandler = this.dragLeaveHandler.bind(this);
      this.dragEndHandler = this.dragEndHandler.bind(this);
      this.dropHandler = this.dropHandler.bind(this);
      this.on('dragover', this.dragOverHandler);
      this.on('dragleave', this.dragLeaveHandler);
      this.on('dragend', this.dragEndHandler);
      this.on('drop', this.dropHandler);
    },

    onDeselect: function() {
      this.isEditing && this.exitEditing();
      this.selected = false;
    },

    /**
     * Initializes "added" event handler
     */
    initAddedHandler: function() {
      var _this = this;
      this.on('added', function() {
        var canvas = _this.canvas;
        if (canvas) {
          if (!canvas._hasITextHandlers) {
            canvas._hasITextHandlers = true;
            _this._initCanvasHandlers(canvas);
          }
          canvas._iTextInstances = canvas._iTextInstances || [];
          canvas._iTextInstances.push(_this);
        }
      });
    },

    initRemovedHandler: function() {
      var _this = this;
      this.on('removed', function() {
        var canvas = _this.canvas;
        if (canvas) {
          canvas._iTextInstances = canvas._iTextInstances || [];
          fabric.util.removeFromArray(canvas._iTextInstances, _this);
          if (canvas._iTextInstances.length === 0) {
            canvas._hasITextHandlers = false;
            _this._removeCanvasHandlers(canvas);
          }
        }
      });
    },

    /**
     * register canvas event to manage exiting on other instances
     * @private
     */
    _initCanvasHandlers: function(canvas) {
      canvas._mouseUpITextHandler = function() {
        if (canvas._iTextInstances) {
          canvas._iTextInstances.forEach(function(obj) {
            obj.__isMousedown = false;
          });
        }
      };
      canvas.on('mouse:up', canvas._mouseUpITextHandler);
    },

    /**
     * remove canvas event to manage exiting on other instances
     * @private
     */
    _removeCanvasHandlers: function(canvas) {
      canvas.off('mouse:up', canvas._mouseUpITextHandler);
    },

    /**
     * @private
     */
    _tick: function() {
      this._currentTickState = this._animateCursor(this, 1, this.cursorDuration, '_onTickComplete');
    },

    /**
     * @private
     */
    _animateCursor: function(obj, targetOpacity, duration, completeMethod) {

      var tickState;

      tickState = {
        isAborted: false,
        abort: function() {
          this.isAborted = true;
        },
      };

      obj.animate('_currentCursorOpacity', targetOpacity, {
        duration: duration,
        onComplete: function() {
          if (!tickState.isAborted) {
            obj[completeMethod]();
          }
        },
        onChange: function() {
          // we do not want to animate a selection, only cursor
          if (obj.canvas && obj.selectionStart === obj.selectionEnd) {
            obj.renderCursorOrSelection();
          }
        },
        abort: function() {
          return tickState.isAborted;
        }
      });
      return tickState;
    },

    /**
     * @private
     */
    _onTickComplete: function() {

      var _this = this;

      if (this._cursorTimeout1) {
        clearTimeout(this._cursorTimeout1);
      }
      this._cursorTimeout1 = setTimeout(function() {
        _this._currentTickCompleteState = _this._animateCursor(_this, 0, this.cursorDuration / 2, '_tick');
      }, 100);
    },

    /**
     * Initializes delayed cursor
     */
    initDelayedCursor: function(restart) {
      var _this = this,
          delay = restart ? 0 : this.cursorDelay;

      this.abortCursorAnimation();
      this._currentCursorOpacity = 1;
      if (delay) {
        this._cursorTimeout2 = setTimeout(function () {
          _this._tick();
        }, delay);
      }
      else {
        this._tick();
      }
    },

    /**
     * Aborts cursor animation, clears all timeouts and clear textarea context if necessary
     */
    abortCursorAnimation: function() {
      var shouldClear = this._currentTickState || this._currentTickCompleteState;
      this._currentTickState && this._currentTickState.abort();
      this._currentTickCompleteState && this._currentTickCompleteState.abort();

      clearTimeout(this._cursorTimeout1);
      clearTimeout(this._cursorTimeout2);

      this._currentCursorOpacity = 0;

      //  make sure we clear context even if instance is not editing
      if (shouldClear) {
        var ctx = this._clearContextTop();
        ctx && ctx.restore();
      }
    },

    /**
     * Selects entire text
     * @return {fabric.IText} thisArg
     * @chainable
     */
    selectAll: function() {
      this.selectionStart = 0;
      this.selectionEnd = this._text.length;
      this._fireSelectionChanged();
      this._updateTextarea();
      return this;
    },

    /**
     * Returns selected text
     * @return {String}
     */
    getSelectedText: function() {
      return this._text.slice(this.selectionStart, this.selectionEnd).join('');
    },

    /**
     * Find new selection index representing start of current word according to current selection index
     * @param {Number} startFrom Current selection index
     * @return {Number} New selection index
     */
    findWordBoundaryLeft: function(startFrom) {
      var offset = 0, index = startFrom - 1;

      // remove space before cursor first
      if (this._reSpace.test(this._text[index])) {
        while (this._reSpace.test(this._text[index])) {
          offset++;
          index--;
        }
      }
      while (/\S/.test(this._text[index]) && index > -1) {
        offset++;
        index--;
      }

      return startFrom - offset;
    },

    /**
     * Find new selection index representing end of current word according to current selection index
     * @param {Number} startFrom Current selection index
     * @return {Number} New selection index
     */
    findWordBoundaryRight: function(startFrom) {
      var offset = 0, index = startFrom;

      // remove space after cursor first
      if (this._reSpace.test(this._text[index])) {
        while (this._reSpace.test(this._text[index])) {
          offset++;
          index++;
        }
      }
      while (/\S/.test(this._text[index]) && index < this._text.length) {
        offset++;
        index++;
      }

      return startFrom + offset;
    },

    /**
     * Find new selection index representing start of current line according to current selection index
     * @param {Number} startFrom Current selection index
     * @return {Number} New selection index
     */
    findLineBoundaryLeft: function(startFrom) {
      var offset = 0, index = startFrom - 1;

      while (!/\n/.test(this._text[index]) && index > -1) {
        offset++;
        index--;
      }

      return startFrom - offset;
    },

    /**
     * Find new selection index representing end of current line according to current selection index
     * @param {Number} startFrom Current selection index
     * @return {Number} New selection index
     */
    findLineBoundaryRight: function(startFrom) {
      var offset = 0, index = startFrom;

      while (!/\n/.test(this._text[index]) && index < this._text.length) {
        offset++;
        index++;
      }

      return startFrom + offset;
    },

    /**
     * Finds index corresponding to beginning or end of a word
     * @param {Number} selectionStart Index of a character
     * @param {Number} direction 1 or -1
     * @return {Number} Index of the beginning or end of a word
     */
    searchWordBoundary: function(selectionStart, direction) {
      var text = this._text,
          index     = this._reSpace.test(text[selectionStart]) ? selectionStart - 1 : selectionStart,
          _char     = text[index],
          // wrong
          reNonWord = fabric.reNonWord;

      while (!reNonWord.test(_char) && index > 0 && index < text.length) {
        index += direction;
        _char = text[index];
      }
      if (reNonWord.test(_char)) {
        index += direction === 1 ? 0 : 1;
      }
      return index;
    },

    /**
     * Selects a word based on the index
     * @param {Number} selectionStart Index of a character
     */
    selectWord: function(selectionStart) {
      selectionStart = selectionStart || this.selectionStart;
      var newSelectionStart = this.searchWordBoundary(selectionStart, -1), /* search backwards */
          newSelectionEnd = this.searchWordBoundary(selectionStart, 1); /* search forward */

      this.selectionStart = newSelectionStart;
      this.selectionEnd = newSelectionEnd;
      this._fireSelectionChanged();
      this._updateTextarea();
      this.renderCursorOrSelection();
    },

    /**
     * Selects a line based on the index
     * @param {Number} selectionStart Index of a character
     * @return {fabric.IText} thisArg
     * @chainable
     */
    selectLine: function(selectionStart) {
      selectionStart = selectionStart || this.selectionStart;
      var newSelectionStart = this.findLineBoundaryLeft(selectionStart),
          newSelectionEnd = this.findLineBoundaryRight(selectionStart);

      this.selectionStart = newSelectionStart;
      this.selectionEnd = newSelectionEnd;
      this._fireSelectionChanged();
      this._updateTextarea();
      return this;
    },

    /**
     * Enters editing state
     * @return {fabric.IText} thisArg
     * @chainable
     */
    enterEditing: function(e) {
      if (this.isEditing || !this.editable) {
        return;
      }

      if (this.canvas) {
        this.canvas.calcOffset();
        this.exitEditingOnOthers(this.canvas);
      }

      this.isEditing = true;

      this.initHiddenTextarea(e);
      this.hiddenTextarea.focus();
      this.hiddenTextarea.value = this.text;
      this._updateTextarea();
      this._saveEditingProps();
      this._setEditingProps();
      this._textBeforeEdit = this.text;

      this._tick();
      this.fire('editing:entered');
      this._fireSelectionChanged();
      if (!this.canvas) {
        return this;
      }
      this.canvas.fire('text:editing:entered', { target: this });
      this.initMouseMoveHandler();
      this.canvas.requestRenderAll();
      return this;
    },

    exitEditingOnOthers: function(canvas) {
      if (canvas._iTextInstances) {
        canvas._iTextInstances.forEach(function(obj) {
          obj.selected = false;
          if (obj.isEditing) {
            obj.exitEditing();
          }
        });
      }
    },

    /**
     * Initializes "mousemove" event handler
     */
    initMouseMoveHandler: function() {
      this.canvas.on('mouse:move', this.mouseMoveHandler);
    },

    /**
     * @private
     */
    mouseMoveHandler: function(options) {
      if (!this.__isMousedown || !this.isEditing) {
        return;
      }

      var newSelectionStart = this.getSelectionStartFromPointer(options.e),
          currentStart = this.selectionStart,
          currentEnd = this.selectionEnd;
      if (
        (newSelectionStart !== this.__selectionStartOnMouseDown || currentStart === currentEnd)
        &&
        (currentStart === newSelectionStart || currentEnd === newSelectionStart)
      ) {
        return;
      }
      if (newSelectionStart > this.__selectionStartOnMouseDown) {
        this.selectionStart = this.__selectionStartOnMouseDown;
        this.selectionEnd = newSelectionStart;
      }
      else {
        this.selectionStart = newSelectionStart;
        this.selectionEnd = this.__selectionStartOnMouseDown;
      }
      if (this.selectionStart !== currentStart || this.selectionEnd !== currentEnd) {
        this.restartCursorIfNeeded();
        this._fireSelectionChanged();
        this._updateTextarea();
        this.renderCursorOrSelection();
      }
    },

    /**
     * Override to customize the drag image
     * https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/setDragImage
     * @param {DragEvent} e
     * @param {object} data
     * @param {number} data.selectionStart
     * @param {number} data.selectionEnd
     * @param {string} data.text
     * @param {string} data.value selected text
     */
    setDragImage: function (e, data) {
      var t = this.calcTransformMatrix();
      var flipFactor = new fabric.Point(this.flipX ? -1 : 1, this.flipY ? -1 : 1);
      var boundaries = this._getCursorBoundaries(data.selectionStart);
      var selectionPosition = new fabric.Point(
        boundaries.left + boundaries.leftOffset,
        boundaries.top + boundaries.topOffset
      ).multiply(flipFactor);
      var pos = fabric.util.transformPoint(selectionPosition, t);
      var pointer = this.canvas.getPointer(e);
      var diff = pointer.subtract(pos);
      var enableRetinaScaling = this.canvas._isRetinaScaling();
      var retinaScaling = this.canvas.getRetinaScaling();
      var bbox = this.getBoundingRect(true);
      var correction = pos.subtract(new fabric.Point(bbox.left, bbox.top));
      var offset = correction.add(diff).scalarMultiply(retinaScaling);
      //  prepare instance for drag image snapshot by making all non selected text invisible
      var bgc = this.backgroundColor;
      var styles = fabric.util.object.clone(this.styles, true);
      delete this.backgroundColor;
      var styleOverride = {
        fill: 'transparent',
        textBackgroundColor: 'transparent'
      };
      this.setSelectionStyles(styleOverride, 0, data.selectionStart);
      this.setSelectionStyles(styleOverride, data.selectionEnd, data.text.length);
      var dragImage = this.toCanvasElement({ enableRetinaScaling: enableRetinaScaling });
      this.backgroundColor = bgc;
      this.styles = styles;
      //  handle retina scaling
      if (enableRetinaScaling && retinaScaling > 1) {
        var c = fabric.util.createCanvasElement();
        c.width = dragImage.width / retinaScaling;
        c.height = dragImage.height / retinaScaling;
        var ctx = c.getContext('2d');
        ctx.scale(1 / retinaScaling, 1 / retinaScaling);
        ctx.drawImage(dragImage, 0, 0);
        dragImage = c;
      }
      this.__dragImageDisposer && this.__dragImageDisposer();
      this.__dragImageDisposer = function () {
        dragImage.remove();
      };
      //  position drag image offsecreen
      fabric.util.setStyle(dragImage, {
        position: 'absolute',
        left: -dragImage.width + 'px',
        border: 'none'
      });
      fabric.document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, offset.x, offset.y);
    },

    /**
     * support native like text dragging
     * @private
     * @param {DragEvent} e
     * @returns {boolean} should handle event
     */
    onDragStart: function (e) {
      this.__dragStartFired = true;
      if (this.__isDragging) {
        var selection = this.__dragStartSelection = {
          selectionStart: this.selectionStart,
          selectionEnd: this.selectionEnd,
        };
        var value = this._text.slice(selection.selectionStart, selection.selectionEnd).join('');
        var data = Object.assign({ text: this.text, value: value }, selection);
        e.dataTransfer.setData('text/plain', value);
        e.dataTransfer.setData('application/fabric', JSON.stringify({
          value: value,
          styles: this.getSelectionStyles(selection.selectionStart, selection.selectionEnd, true)
        }));
        e.dataTransfer.effectAllowed = 'copyMove';
        this.setDragImage(e, data);
      }
      return this.__isDragging;
    },

    /**
     * Override to customize drag and drop behavior
     * @public
     * @param {DragEvent} e
     * @returns {boolean}
     */
    canDrop: function (e) {
      if (this.editable && !this.__corner) {
        if (this.__isDragging && this.__dragStartSelection) {
          //  drag source trying to drop over itself
          //  allow dropping only outside of drag start selection
          var index = this.getSelectionStartFromPointer(e);
          var dragStartSelection = this.__dragStartSelection;
          return index < dragStartSelection.selectionStart || index > dragStartSelection.selectionEnd;
        }
        return true;
      }
      return false;
    },

    /**
     * support native like text dragging
     * @private
     * @param {object} options
     * @param {DragEvent} options.e
     */
    dragOverHandler: function (options) {
      var e = options.e;
      var canDrop = !e.defaultPrevented && this.canDrop(e);
      if (!this.__isDraggingOver && canDrop) {
        this.__isDraggingOver = true;
        this.enterEditing(e);
        this.__isDragging && this.abortCursorAnimation();
      }
      else if (this.__isDraggingOver && !canDrop) {
        //  drop state has changed
        this.__isDraggingOver = false;
        !this.__isDragging && this.clearContextTop();
        this.exitEditing();
      }
      if (this.__isDraggingOver) {
        //  can be dropped, inform browser
        e.preventDefault();
        //  inform event subscribers
        options.canDrop = true;
        options.dropTarget = this;
        //  render
        this.setCursorByClick(e);
        this._updateTextarea();
        this.restartCursorIfNeeded();
        this.renderCursorOrSelection();
      }
    },

    /**
     * support native like text dragging
     * @private
     */
    dragLeaveHandler: function () {
      if (this.__isDraggingOver || this.__isDragging) {
        this.__isDraggingOver = false;
        !this.__isDragging && this.clearContextTop();
        this.exitEditing();
      }
    },

    /**
     * support native like text dragging
     * fired only on the drag source
     * handle changes to the drag source in case of a drop on another object or a cancellation
     * https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations#finishing_a_drag
     * @private
     * @param {object} options
     * @param {DragEvent} options.e
     */
    dragEndHandler: function (options) {
      var e = options.e;
      if (this.__isDragging && this.__dragStartFired) {
        //  once the drop event finishes we check if we need to change the drag source
        //  if the drag source received the drop we bail out
        if (this.__dragStartSelection) {
          var selectionStart = this.__dragStartSelection.selectionStart;
          var selectionEnd = this.__dragStartSelection.selectionEnd;
          var dropEffect = e.dataTransfer.dropEffect;
          if (dropEffect === 'none') {
            this.selectionStart = selectionStart;
            this.selectionEnd = selectionEnd;
            this._updateTextarea();
          }
          else {
            var ctx = this._clearContextTop();
            ctx && ctx.restore();
            if (dropEffect === 'move') {
              this.insertChars('', null, selectionStart, selectionEnd);
              this.selectionStart = this.selectionEnd = selectionStart;
              this.hiddenTextarea && (this.hiddenTextarea.value = this.text);
              this._updateTextarea();
              this.fire('changed', { index: selectionStart, action: 'dragend' });
              this.canvas.fire('text:changed', { target: this });
              this.canvas.requestRenderAll();
            }
            this.exitEditing();
            //  disable mouse up logic
            this.__lastSelected = false;
          }
        }
      }

      this.__dragImageDisposer && this.__dragImageDisposer();
      delete this.__dragImageDisposer;
      delete this.__dragStartSelection;
      this.__isDraggingOver = false;
    },

    /**
     * support native like text dragging
     *
     * Override the `text/plain | application/fabric` types of {@link DragEvent#dataTransfer}
     * in order to change the drop value or to customize styling respectively, by listening to the `drop:before` event
     * https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations#performing_a_drop
     * @private
     * @param {object} options
     * @param {DragEvent} options.e
     */
    dropHandler: function (options) {
      var e = options.e, didDrop = e.defaultPrevented;
      this.__isDraggingOver = false;
      // inform browser that the drop has been accepted
      e.preventDefault();
      var insert = e.dataTransfer.getData('text/plain');
      if (insert && !didDrop) {
        var insertAt = this.selectionStart;
        var data = e.dataTransfer.types.includes('application/fabric') ?
          JSON.parse(e.dataTransfer.getData('application/fabric')) :
          {};
        var styles = data.styles;
        var trailing = insert[Math.max(0, insert.length - 1)];
        this.canvas.discardActiveObject();
        this.canvas.setActiveObject(this);
        this.enterEditing(e);
        var selectionStartOffset = 0;
        //  drag and drop in same instance
        if (this.__dragStartSelection) {
          var selectionStart = this.__dragStartSelection.selectionStart;
          var selectionEnd = this.__dragStartSelection.selectionEnd;
          if (insertAt > selectionStart && insertAt <= selectionEnd) {
            insertAt = selectionStart;
          }
          else if (insertAt > selectionEnd) {
            insertAt -= selectionEnd - selectionStart;
          }
          this.insertChars('', null, selectionStart, selectionEnd);
          // prevent `dragend` from handling event
          delete this.__dragStartSelection;
        }
        //  remove redundant line break
        if (this._reNewline.test(trailing)
          && (this._reNewline.test(this._text[insertAt]) || insertAt === this._text.length)) {
          insert = insert.trimEnd();
        }
        //  inform subscribers
        options.didDrop = true;
        options.dropTarget = this;
        //  finalize
        this.insertChars(insert, styles, insertAt);
        this.selectionStart = Math.min(insertAt + selectionStartOffset, this._text.length);
        this.selectionEnd = Math.min(this.selectionStart + insert.length, this._text.length);
        this.hiddenTextarea && (this.hiddenTextarea.value = this.text);
        this._updateTextarea();
        this.fire('changed', { index: insertAt + selectionStartOffset, action: 'drop' });
        this.canvas.fire('text:changed', { target: this });
        this.canvas.requestRenderAll();
      }
    },

    /**
     * @private
     */
    _setEditingProps: function() {
      this.hoverCursor = 'text';

      if (this.canvas) {
        this.canvas.defaultCursor = this.canvas.moveCursor = 'text';
      }

      this.borderColor = this.editingBorderColor;
      this.hasControls = this.selectable = false;
      this.lockMovementX = this.lockMovementY = true;
    },

    /**
     * convert from textarea to grapheme indexes
     */
    fromStringToGraphemeSelection: function(start, end, text) {
      var smallerTextStart = text.slice(0, start),
          graphemeStart = this.graphemeSplit(smallerTextStart).length;
      if (start === end) {
        return { selectionStart: graphemeStart, selectionEnd: graphemeStart };
      }
      var smallerTextEnd = text.slice(start, end),
          graphemeEnd = this.graphemeSplit(smallerTextEnd).length;
      return { selectionStart: graphemeStart, selectionEnd: graphemeStart + graphemeEnd };
    },

    /**
     * convert from fabric to textarea values
     */
    fromGraphemeToStringSelection: function(start, end, _text) {
      var smallerTextStart = _text.slice(0, start),
          graphemeStart = smallerTextStart.join('').length;
      if (start === end) {
        return { selectionStart: graphemeStart, selectionEnd: graphemeStart };
      }
      var smallerTextEnd = _text.slice(start, end),
          graphemeEnd = smallerTextEnd.join('').length;
      return { selectionStart: graphemeStart, selectionEnd: graphemeStart + graphemeEnd };
    },

    /**
     * @private
     */
    _updateTextarea: function() {
      this.cursorOffsetCache = { };
      if (!this.hiddenTextarea) {
        return;
      }
      if (!this.inCompositionMode) {
        var newSelection = this.fromGraphemeToStringSelection(this.selectionStart, this.selectionEnd, this._text);
        this.hiddenTextarea.selectionStart = newSelection.selectionStart;
        this.hiddenTextarea.selectionEnd = newSelection.selectionEnd;
      }
      this.updateTextareaPosition();
    },

    /**
     * @private
     */
    updateFromTextArea: function() {
      if (!this.hiddenTextarea) {
        return;
      }
      this.cursorOffsetCache = { };
      this.text = this.hiddenTextarea.value;
      if (this._shouldClearDimensionCache()) {
        this.initDimensions();
        this.setCoords();
      }
      var newSelection = this.fromStringToGraphemeSelection(
        this.hiddenTextarea.selectionStart, this.hiddenTextarea.selectionEnd, this.hiddenTextarea.value);
      this.selectionEnd = this.selectionStart = newSelection.selectionEnd;
      if (!this.inCompositionMode) {
        this.selectionStart = newSelection.selectionStart;
      }
      this.updateTextareaPosition();
    },

    /**
     * @private
     */
    updateTextareaPosition: function() {
      if (this.selectionStart === this.selectionEnd) {
        var style = this._calcTextareaPosition();
        this.hiddenTextarea.style.left = style.left;
        this.hiddenTextarea.style.top = style.top;
      }
    },

    /**
     * @private
     * @return {Object} style contains style for hiddenTextarea
     */
    _calcTextareaPosition: function() {
      if (!this.canvas) {
        return { x: 1, y: 1 };
      }
      var desiredPosition = this.inCompositionMode ? this.compositionStart : this.selectionStart,
          boundaries = this._getCursorBoundaries(desiredPosition),
          cursorLocation = this.get2DCursorLocation(desiredPosition),
          lineIndex = cursorLocation.lineIndex,
          charIndex = cursorLocation.charIndex,
          charHeight = this.getValueOfPropertyAt(lineIndex, charIndex, 'fontSize') * this.lineHeight,
          leftOffset = boundaries.leftOffset,
          m = this.calcTransformMatrix(),
          p = {
            x: boundaries.left + leftOffset,
            y: boundaries.top + boundaries.topOffset + charHeight
          },
          retinaScaling = this.canvas.getRetinaScaling(),
          upperCanvas = this.canvas.upperCanvasEl,
          upperCanvasWidth = upperCanvas.width / retinaScaling,
          upperCanvasHeight = upperCanvas.height / retinaScaling,
          maxWidth = upperCanvasWidth - charHeight,
          maxHeight = upperCanvasHeight - charHeight,
          scaleX = upperCanvas.clientWidth / upperCanvasWidth,
          scaleY = upperCanvas.clientHeight / upperCanvasHeight;

      p = fabric.util.transformPoint(p, m);
      p = fabric.util.transformPoint(p, this.canvas.viewportTransform);
      p.x *= scaleX;
      p.y *= scaleY;
      if (p.x < 0) {
        p.x = 0;
      }
      if (p.x > maxWidth) {
        p.x = maxWidth;
      }
      if (p.y < 0) {
        p.y = 0;
      }
      if (p.y > maxHeight) {
        p.y = maxHeight;
      }

      // add canvas offset on document
      p.x += this.canvas._offset.left;
      p.y += this.canvas._offset.top;

      return { left: p.x + 'px', top: p.y + 'px', fontSize: charHeight + 'px', charHeight: charHeight };
    },

    /**
     * @private
     */
    _saveEditingProps: function() {
      this._savedProps = {
        hasControls: this.hasControls,
        borderColor: this.borderColor,
        lockMovementX: this.lockMovementX,
        lockMovementY: this.lockMovementY,
        hoverCursor: this.hoverCursor,
        selectable: this.selectable,
        defaultCursor: this.canvas && this.canvas.defaultCursor,
        moveCursor: this.canvas && this.canvas.moveCursor
      };
    },

    /**
     * @private
     */
    _restoreEditingProps: function() {
      if (!this._savedProps) {
        return;
      }

      this.hoverCursor = this._savedProps.hoverCursor;
      this.hasControls = this._savedProps.hasControls;
      this.borderColor = this._savedProps.borderColor;
      this.selectable = this._savedProps.selectable;
      this.lockMovementX = this._savedProps.lockMovementX;
      this.lockMovementY = this._savedProps.lockMovementY;

      if (this.canvas) {
        this.canvas.defaultCursor = this._savedProps.defaultCursor;
        this.canvas.moveCursor = this._savedProps.moveCursor;
      }

      delete this._savedProps;
    },

    /**
     * Exits from editing state
     * @return {fabric.IText} thisArg
     * @chainable
     */
    exitEditing: function() {
      var isTextChanged = (this._textBeforeEdit !== this.text);
      var hiddenTextarea = this.hiddenTextarea;
      this.selected = false;
      this.isEditing = false;

      this.selectionEnd = this.selectionStart;

      if (hiddenTextarea) {
        hiddenTextarea.blur && hiddenTextarea.blur();
        hiddenTextarea.parentNode && hiddenTextarea.parentNode.removeChild(hiddenTextarea);
      }
      this.hiddenTextarea = null;
      this.abortCursorAnimation();
      this._restoreEditingProps();
      this._currentCursorOpacity = 0;
      if (this._shouldClearDimensionCache()) {
        this.initDimensions();
        this.setCoords();
      }
      this.fire('editing:exited');
      isTextChanged && this.fire('modified');
      if (this.canvas) {
        this.canvas.off('mouse:move', this.mouseMoveHandler);
        this.canvas.fire('text:editing:exited', { target: this });
        isTextChanged && this.canvas.fire('object:modified', { target: this });
      }
      return this;
    },

    /**
     * @private
     */
    _removeExtraneousStyles: function() {
      for (var prop in this.styles) {
        if (!this._textLines[prop]) {
          delete this.styles[prop];
        }
      }
    },

    /**
     * remove and reflow a style block from start to end.
     * @param {Number} start linear start position for removal (included in removal)
     * @param {Number} end linear end position for removal ( excluded from removal )
     */
    removeStyleFromTo: function(start, end) {
      var cursorStart = this.get2DCursorLocation(start, true),
          cursorEnd = this.get2DCursorLocation(end, true),
          lineStart = cursorStart.lineIndex,
          charStart = cursorStart.charIndex,
          lineEnd = cursorEnd.lineIndex,
          charEnd = cursorEnd.charIndex,
          i, styleObj;
      if (lineStart !== lineEnd) {
        // step1 remove the trailing of lineStart
        if (this.styles[lineStart]) {
          for (i = charStart; i < this._unwrappedTextLines[lineStart].length; i++) {
            delete this.styles[lineStart][i];
          }
        }
        // step2 move the trailing of lineEnd to lineStart if needed
        if (this.styles[lineEnd]) {
          for (i = charEnd; i < this._unwrappedTextLines[lineEnd].length; i++) {
            styleObj = this.styles[lineEnd][i];
            if (styleObj) {
              this.styles[lineStart] || (this.styles[lineStart] = { });
              this.styles[lineStart][charStart + i - charEnd] = styleObj;
            }
          }
        }
        // step3 detects lines will be completely removed.
        for (i = lineStart + 1; i <= lineEnd; i++) {
          delete this.styles[i];
        }
        // step4 shift remaining lines.
        this.shiftLineStyles(lineEnd, lineStart - lineEnd);
      }
      else {
        // remove and shift left on the same line
        if (this.styles[lineStart]) {
          styleObj = this.styles[lineStart];
          var diff = charEnd - charStart, numericChar, _char;
          for (i = charStart; i < charEnd; i++) {
            delete styleObj[i];
          }
          for (_char in this.styles[lineStart]) {
            numericChar = parseInt(_char, 10);
            if (numericChar >= charEnd) {
              styleObj[numericChar - diff] = styleObj[_char];
              delete styleObj[_char];
            }
          }
        }
      }
    },

    /**
     * Shifts line styles up or down
     * @param {Number} lineIndex Index of a line
     * @param {Number} offset Can any number?
     */
    shiftLineStyles: function(lineIndex, offset) {
      // shift all line styles by offset upward or downward
      // do not clone deep. we need new array, not new style objects
      var clonedStyles = clone(this.styles);
      for (var line in this.styles) {
        var numericLine = parseInt(line, 10);
        if (numericLine > lineIndex) {
          this.styles[numericLine + offset] = clonedStyles[numericLine];
          if (!clonedStyles[numericLine - offset]) {
            delete this.styles[numericLine];
          }
        }
      }
    },

    restartCursorIfNeeded: function() {
      if (!this._currentTickState || this._currentTickState.isAborted
        || !this._currentTickCompleteState || this._currentTickCompleteState.isAborted
      ) {
        this.initDelayedCursor();
      }
    },

    /**
     * Handle insertion of more consecutive style lines for when one or more
     * newlines gets added to the text. Since current style needs to be shifted
     * first we shift the current style of the number lines needed, then we add
     * new lines from the last to the first.
     * @param {Number} lineIndex Index of a line
     * @param {Number} charIndex Index of a char
     * @param {Number} qty number of lines to add
     * @param {Array} copiedStyle Array of objects styles
     */
    insertNewlineStyleObject: function(lineIndex, charIndex, qty, copiedStyle) {
      var currentCharStyle,
          newLineStyles = {},
          somethingAdded = false,
          isEndOfLine = this._unwrappedTextLines[lineIndex].length === charIndex;

      qty || (qty = 1);
      this.shiftLineStyles(lineIndex, qty);
      if (this.styles[lineIndex]) {
        currentCharStyle = this.styles[lineIndex][charIndex === 0 ? charIndex : charIndex - 1];
      }
      // we clone styles of all chars
      // after cursor onto the current line
      for (var index in this.styles[lineIndex]) {
        var numIndex = parseInt(index, 10);
        if (numIndex >= charIndex) {
          somethingAdded = true;
          newLineStyles[numIndex - charIndex] = this.styles[lineIndex][index];
          // remove lines from the previous line since they're on a new line now
          if (!(isEndOfLine && charIndex === 0)) {
            delete this.styles[lineIndex][index];
          }
        }
      }
      var styleCarriedOver = false;
      if (somethingAdded && !isEndOfLine) {
        // if is end of line, the extra style we copied
        // is probably not something we want
        this.styles[lineIndex + qty] = newLineStyles;
        styleCarriedOver = true;
      }
      if (styleCarriedOver) {
        // skip the last line of since we already prepared it.
        qty--;
      }
      // for the all the lines or all the other lines
      // we clone current char style onto the next (otherwise empty) line
      while (qty > 0) {
        if (copiedStyle && copiedStyle[qty - 1]) {
          this.styles[lineIndex + qty] = { 0: clone(copiedStyle[qty - 1]) };
        }
        else if (currentCharStyle) {
          this.styles[lineIndex + qty] = { 0: clone(currentCharStyle) };
        }
        else {
          delete this.styles[lineIndex + qty];
        }
        qty--;
      }
      this._forceClearCache = true;
    },

    /**
     * Inserts style object for a given line/char index
     * @param {Number} lineIndex Index of a line
     * @param {Number} charIndex Index of a char
     * @param {Number} quantity number Style object to insert, if given
     * @param {Array} copiedStyle array of style objects
     */
    insertCharStyleObject: function(lineIndex, charIndex, quantity, copiedStyle) {
      if (!this.styles) {
        this.styles = {};
      }
      var currentLineStyles       = this.styles[lineIndex],
          currentLineStylesCloned = currentLineStyles ? clone(currentLineStyles) : {};

      quantity || (quantity = 1);
      // shift all char styles by quantity forward
      // 0,1,2,3 -> (charIndex=2) -> 0,1,3,4 -> (insert 2) -> 0,1,2,3,4
      for (var index in currentLineStylesCloned) {
        var numericIndex = parseInt(index, 10);
        if (numericIndex >= charIndex) {
          currentLineStyles[numericIndex + quantity] = currentLineStylesCloned[numericIndex];
          // only delete the style if there was nothing moved there
          if (!currentLineStylesCloned[numericIndex - quantity]) {
            delete currentLineStyles[numericIndex];
          }
        }
      }
      this._forceClearCache = true;
      if (copiedStyle) {
        while (quantity--) {
          if (!Object.keys(copiedStyle[quantity]).length) {
            continue;
          }
          if (!this.styles[lineIndex]) {
            this.styles[lineIndex] = {};
          }
          this.styles[lineIndex][charIndex + quantity] = clone(copiedStyle[quantity]);
        }
        return;
      }
      if (!currentLineStyles) {
        return;
      }
      var newStyle = currentLineStyles[charIndex ? charIndex - 1 : 1];
      while (newStyle && quantity--) {
        this.styles[lineIndex][charIndex + quantity] = clone(newStyle);
      }
    },

    /**
     * Inserts style object(s)
     * @param {Array} insertedText Characters at the location where style is inserted
     * @param {Number} start cursor index for inserting style
     * @param {Array} [copiedStyle] array of style objects to insert.
     */
    insertNewStyleBlock: function(insertedText, start, copiedStyle) {
      var cursorLoc = this.get2DCursorLocation(start, true),
          addedLines = [0], linesLength = 0;
      // get an array of how many char per lines are being added.
      for (var i = 0; i < insertedText.length; i++) {
        if (insertedText[i] === '\n') {
          linesLength++;
          addedLines[linesLength] = 0;
        }
        else {
          addedLines[linesLength]++;
        }
      }
      // for the first line copy the style from the current char position.
      if (addedLines[0] > 0) {
        this.insertCharStyleObject(cursorLoc.lineIndex, cursorLoc.charIndex, addedLines[0], copiedStyle);
        copiedStyle = copiedStyle && copiedStyle.slice(addedLines[0] + 1);
      }
      linesLength && this.insertNewlineStyleObject(
        cursorLoc.lineIndex, cursorLoc.charIndex + addedLines[0], linesLength);
      for (var i = 1; i < linesLength; i++) {
        if (addedLines[i] > 0) {
          this.insertCharStyleObject(cursorLoc.lineIndex + i, 0, addedLines[i], copiedStyle);
        }
        else if (copiedStyle) {
          // this test is required in order to close #6841
          // when a pasted buffer begins with a newline then
          // this.styles[cursorLoc.lineIndex + i] and copiedStyle[0]
          // may be undefined for some reason
          if (this.styles[cursorLoc.lineIndex + i] && copiedStyle[0]) {
            this.styles[cursorLoc.lineIndex + i][0] = copiedStyle[0];
          }
        }
        copiedStyle = copiedStyle && copiedStyle.slice(addedLines[i] + 1);
      }
      // we use i outside the loop to get it like linesLength
      if (addedLines[i] > 0) {
        this.insertCharStyleObject(cursorLoc.lineIndex + i, 0, addedLines[i], copiedStyle);
      }
    },

    /**
     * Set the selectionStart and selectionEnd according to the new position of cursor
     * mimic the key - mouse navigation when shift is pressed.
     */
    setSelectionStartEndWithShift: function(start, end, newSelection) {
      if (newSelection <= start) {
        if (end === start) {
          this._selectionDirection = 'left';
        }
        else if (this._selectionDirection === 'right') {
          this._selectionDirection = 'left';
          this.selectionEnd = start;
        }
        this.selectionStart = newSelection;
      }
      else if (newSelection > start && newSelection < end) {
        if (this._selectionDirection === 'right') {
          this.selectionEnd = newSelection;
        }
        else {
          this.selectionStart = newSelection;
        }
      }
      else {
        // newSelection is > selection start and end
        if (end === start) {
          this._selectionDirection = 'right';
        }
        else if (this._selectionDirection === 'left') {
          this._selectionDirection = 'right';
          this.selectionStart = end;
        }
        this.selectionEnd = newSelection;
      }
    },

    setSelectionInBoundaries: function() {
      var length = this.text.length;
      if (this.selectionStart > length) {
        this.selectionStart = length;
      }
      else if (this.selectionStart < 0) {
        this.selectionStart = 0;
      }
      if (this.selectionEnd > length) {
        this.selectionEnd = length;
      }
      else if (this.selectionEnd < 0) {
        this.selectionEnd = 0;
      }
    }
  });
})();
