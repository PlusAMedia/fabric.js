(function() {

  function getCoords(coords) {
    return [
      new fabric.Point(coords.tl.x, coords.tl.y),
      new fabric.Point(coords.tr.x, coords.tr.y),
      new fabric.Point(coords.br.x, coords.br.y),
      new fabric.Point(coords.bl.x, coords.bl.y)
    ];
  }

  var degreesToRadians = fabric.util.degreesToRadians,
      multiplyMatrices = fabric.util.multiplyTransformMatrices,
      transformPoint = fabric.util.transformPoint;

  fabric.util.object.extend(fabric.Object.prototype, /** @lends fabric.Object.prototype */ {

    /**
     * Describe object's corner position in canvas element coordinates.
     * properties are tl,mt,tr,ml,mr,bl,mb,br,mtr for the main controls.
     * each property is an object with x, y and corner.
     * The `corner` property contains in a similar manner the 4 points of the
     * interactive area of the corner.
     * The coordinates depends from this properties: width, height, scaleX, scaleY
     * skewX, skewY, angle, strokeWidth, viewportTransform, top, left, padding.
     * The coordinates get updated with @method setCoords.
     * You can calculate them without updating with @method calcCoords;
     * @memberOf fabric.Object.prototype
     */
    oCoords: null,

    /**
     * Describe object's corner position in canvas object absolute coordinates
     * properties are tl,tr,bl,br and describe the four main corner.
     * each property is an object with x, y, instance of Fabric.Point.
     * The coordinates depends from this properties: width, height, scaleX, scaleY
     * skewX, skewY, angle, strokeWidth, top, left.
     * Those coordinates are useful to understand where an object is. They get updated
     * with oCoords but they do not need to be updated when zoom or panning change.
     * The coordinates get updated with @method setCoords.
     * You can calculate them without updating with @method calcCoords(true);
     * @memberOf fabric.Object.prototype
     */
    aCoords: null,

    /**
     * storage for object transform matrix
     */
    ownMatrixCache: null,

    /**
     * storage for object full transform matrix
     */
    matrixCache: null,

    /**
     * return correct set of coordinates for intersection
     */
    getCoords: function(absolute, calculate) {
      if (!this.oCoords) {
        this.setCoords();
      }
      var coords = absolute ? this.aCoords : this.oCoords;
      return getCoords(calculate ? this.calcCoords(absolute) : coords);
    },

    /**
     * Checks if object intersects with an area formed by 2 points
     * @param {Object} pointTL top-left point of area
     * @param {Object} pointBR bottom-right point of area
     * @param {Boolean} [absolute] use coordinates without viewportTransform
     * @param {Boolean} [calculate] use coordinates of current position instead of .oCoords
     * @return {Boolean} true if object intersects with an area formed by 2 points
     */
    intersectsWithRect: function(pointTL, pointBR, absolute, calculate) {
      var coords = this.getCoords(absolute, calculate),
          intersection = fabric.Intersection.intersectPolygonRectangle(
            coords,
            pointTL,
            pointBR
          );
      return intersection.status === 'Intersection';
    },

    /**
     * Checks if object intersects with another object
     * @param {Object} other Object to test
     * @param {Boolean} [absolute] use coordinates without viewportTransform
     * @param {Boolean} [calculate] use coordinates of current position instead of .oCoords
     * @return {Boolean} true if object intersects with another object
     */
    intersectsWithObject: function(other, absolute, calculate) {
      var intersection = fabric.Intersection.intersectPolygonPolygon(
        this.getCoords(absolute, calculate),
        other.getCoords(absolute, calculate)
      );

      return intersection.status === 'Intersection'
        || other.isContainedWithinObject(this, absolute, calculate)
        || this.isContainedWithinObject(other, absolute, calculate);
    },

    /**
     * Checks if object is fully contained within area of another object
     * @param {Object} other Object to test
     * @param {Boolean} [absolute] use coordinates without viewportTransform
     * @param {Boolean} [calculate] use coordinates of current position instead of .oCoords
     * @return {Boolean} true if object is fully contained within area of another object
     */
    isContainedWithinObject: function(other, absolute, calculate) {
      var points = this.getCoords(absolute, calculate),
          i = 0, lines = other._getImageLines(
            calculate ? other.calcCoords(absolute) : absolute ? other.aCoords : other.oCoords
          );
      for (; i < 4; i++) {
        if (!other.containsPoint(points[i], lines)) {
          return false;
        }
      }
      return true;
    },

    /**
     * Checks if object is fully contained within area formed by 2 points
     * @param {Object} pointTL top-left point of area
     * @param {Object} pointBR bottom-right point of area
     * @param {Boolean} [absolute] use coordinates without viewportTransform
     * @param {Boolean} [calculate] use coordinates of current position instead of .oCoords
     * @return {Boolean} true if object is fully contained within area formed by 2 points
     */
    isContainedWithinRect: function(pointTL, pointBR, absolute, calculate) {
      var boundingRect = this.getBoundingRect(absolute, calculate);

      return (
        boundingRect.left >= pointTL.x &&
        boundingRect.left + boundingRect.width <= pointBR.x &&
        boundingRect.top >= pointTL.y &&
        boundingRect.top + boundingRect.height <= pointBR.y
      );
    },

    /**
     * Checks if point is inside the object
     * @param {fabric.Point} point Point to check against
     * @param {Object} [lines] object returned from @method _getImageLines
     * @param {Boolean} [absolute] use coordinates without viewportTransform
     * @param {Boolean} [calculate] use coordinates of current position instead of .oCoords
     * @return {Boolean} true if point is inside the object
     */
    containsPoint: function(point, lines, absolute, calculate) {
      var lines = lines || this._getImageLines(
            calculate ? this.calcCoords(absolute) : absolute ? this.aCoords : this.oCoords
          ),
          xPoints = this._findCrossPoints(point, lines);

      // if xPoints is odd then point is inside the object
      return (xPoints !== 0 && xPoints % 2 === 1);
    },

    /**
     * Checks if object is contained within the canvas with current viewportTransform
     * the check is done stopping at first point that appears on screen
     * @param {Boolean} [calculate] use coordinates of current position instead of .aCoords
     * @return {Boolean} true if object is fully or partially contained within canvas
     */
    isOnScreen: function(calculate) {
      if (!this.canvas) {
        return false;
      }
      var pointTL = this.canvas.vptCoords.tl, pointBR = this.canvas.vptCoords.br;
      var points = this.getCoords(true, calculate), point;
      for (var i = 0; i < 4; i++) {
        point = points[i];
        if (point.x <= pointBR.x && point.x >= pointTL.x && point.y <= pointBR.y && point.y >= pointTL.y) {
          return true;
        }
      }
      // no points on screen, check intersection with absolute coordinates
      if (this.intersectsWithRect(pointTL, pointBR, true, calculate)) {
        return true;
      }
      return this._containsCenterOfCanvas(pointTL, pointBR, calculate);
    },

    /**
     * Checks if the object contains the midpoint between canvas extremities
     * Does not make sense outside the context of isOnScreen and isPartiallyOnScreen
     * @private
     * @param {Fabric.Point} pointTL Top Left point
     * @param {Fabric.Point} pointBR Top Right point
     * @param {Boolean} calculate use coordinates of current position instead of .oCoords
     * @return {Boolean} true if the object contains the point
     */
    _containsCenterOfCanvas: function(pointTL, pointBR, calculate) {
      // worst case scenario the object is so big that contains the screen
      var centerPoint = { x: (pointTL.x + pointBR.x) / 2, y: (pointTL.y + pointBR.y) / 2 };
      if (this.containsPoint(centerPoint, null, true, calculate)) {
        return true;
      }
      return false;
    },

    /**
     * Checks if object is partially contained within the canvas with current viewportTransform
     * @param {Boolean} [calculate] use coordinates of current position instead of .oCoords
     * @return {Boolean} true if object is partially contained within canvas
     */
    isPartiallyOnScreen: function(calculate) {
      if (!this.canvas) {
        return false;
      }
      var pointTL = this.canvas.vptCoords.tl, pointBR = this.canvas.vptCoords.br;
      if (this.intersectsWithRect(pointTL, pointBR, true, calculate)) {
        return true;
      }
      return this._containsCenterOfCanvas(pointTL, pointBR, calculate);
    },

    /**
     * Method that returns an object with the object edges in it, given the coordinates of the corners
     * @private
     * @param {Object} oCoords Coordinates of the object corners
     */
    _getImageLines: function(oCoords) {
      return {
        topline: {
          o: oCoords.tl,
          d: oCoords.tr
        },
        rightline: {
          o: oCoords.tr,
          d: oCoords.br
        },
        bottomline: {
          o: oCoords.br,
          d: oCoords.bl
        },
        leftline: {
          o: oCoords.bl,
          d: oCoords.tl
        }
      };
    },

    /**
     * Helper method to determine how many cross points are between the 4 object edges
     * and the horizontal line determined by a point on canvas
     * @private
     * @param {fabric.Point} point Point to check
     * @param {Object} lines Coordinates of the object being evaluated
     */
    // remove yi, not used but left code here just in case.
    _findCrossPoints: function(point, lines) {
      var b1, b2, a1, a2, xi, // yi,
          xcount = 0,
          iLine;

      for (var lineKey in lines) {
        iLine = lines[lineKey];
        // optimisation 1: line below point. no cross
        if ((iLine.o.y < point.y) && (iLine.d.y < point.y)) {
          continue;
        }
        // optimisation 2: line above point. no cross
        if ((iLine.o.y >= point.y) && (iLine.d.y >= point.y)) {
          continue;
        }
        // optimisation 3: vertical line case
        if ((iLine.o.x === iLine.d.x) && (iLine.o.x >= point.x)) {
          xi = iLine.o.x;
          // yi = point.y;
        }
        // calculate the intersection point
        else {
          b1 = 0;
          b2 = (iLine.d.y - iLine.o.y) / (iLine.d.x - iLine.o.x);
          a1 = point.y - b1 * point.x;
          a2 = iLine.o.y - b2 * iLine.o.x;

          xi = -(a1 - a2) / (b1 - b2);
          // yi = a1 + b1 * xi;
        }
        // dont count xi < point.x cases
        if (xi >= point.x) {
          xcount += 1;
        }
        // optimisation 4: specific for square images
        if (xcount === 2) {
          break;
        }
      }
      return xcount;
    },

    /**
     * Returns coordinates of object's bounding rectangle (left, top, width, height)
     * the box is intended as aligned to axis of canvas.
     * @param {Boolean} [absolute] use coordinates without viewportTransform
     * @param {Boolean} [calculate] use coordinates of current position instead of .oCoords / .aCoords
     * @return {Object} Object with left, top, width, height properties
     */
    getBoundingRect: function(absolute, calculate) {
      var coords = this.getCoords(absolute, calculate);
      return fabric.util.makeBoundingBoxFromPoints(coords);
    },

    /**
     * Returns width of an object's bounding box counting transformations
     * before 2.0 it was named getWidth();
     * @return {Number} width value
     */
    getScaledWidth: function() {
      return this._getTransformedDimensions().x;
    },

    /**
     * Returns height of an object bounding box counting transformations
     * before 2.0 it was named getHeight();
     * @return {Number} height value
     */
    getScaledHeight: function() {
      return this._getTransformedDimensions().y;
    },

    /**
     * Makes sure the scale is valid and modifies it if necessary
     * @private
     * @param {Number} value
     * @return {Number}
     */
    _constrainScale: function(value) {
      if (Math.abs(value) < this.minScaleLimit) {
        if (value < 0) {
          return -this.minScaleLimit;
        }
        else {
          return this.minScaleLimit;
        }
      }
      else if (value === 0) {
        return 0.0001;
      }
      return value;
    },

    /**
     * Scales an object (equally by x and y)
     * @param {Number} value Scale factor
     * @return {fabric.Object} thisArg
     * @chainable
     */
    scale: function(value) {
      this._set('scaleX', value);
      this._set('scaleY', value);
      return this.setCoords();
    },

    /**
     * Scales an object to a given width, with respect to bounding box (scaling by x/y equally)
     * @param {Number} value New width value
     * @param {Boolean} [absolute] ignore viewport
     * @return {fabric.Object} thisArg
     * @chainable
     */
    scaleToWidth: function(value, absolute) {
      // adjust to bounding rect factor so that rotated shapes would fit as well
      var boundingRectFactor = this.getBoundingRect(absolute).width / this.getScaledWidth();
      return this.scale(value / this.width / boundingRectFactor);
    },

    /**
     * Scales an object to a given height, with respect to bounding box (scaling by x/y equally)
     * @param {Number} value New height value
     * @param {Boolean} [absolute] ignore viewport
     * @return {fabric.Object} thisArg
     * @chainable
     */
    scaleToHeight: function(value, absolute) {
      // adjust to bounding rect factor so that rotated shapes would fit as well
      var boundingRectFactor = this.getBoundingRect(absolute).height / this.getScaledHeight();
      return this.scale(value / this.height / boundingRectFactor);
    },

    /**
     * Calculates and returns the .coords of an object.
     * @return {Object} Object with tl, tr, br, bl ....
     * @chainable
     */
    calcCoords: function(absolute) {
      var rotateMatrix = this._calcRotateMatrix(),
          translateMatrix = this._calcTranslateMatrix(),
          startMatrix = multiplyMatrices(translateMatrix, rotateMatrix),
          vpt = this.getViewportTransform(),
          finalMatrix = absolute ? startMatrix : multiplyMatrices(vpt, startMatrix),
          dim = this._getTransformedDimensions(),
          w = dim.x / 2, h = dim.y / 2,
          tl = transformPoint({ x: -w, y: -h }, finalMatrix),
          tr = transformPoint({ x: w, y: -h }, finalMatrix),
          bl = transformPoint({ x: -w, y: h }, finalMatrix),
          br = transformPoint({ x: w, y: h }, finalMatrix);
      if (!absolute) {
        var padding = this.padding, angle = degreesToRadians(this.angle),
            cos = fabric.util.cos(angle), sin = fabric.util.sin(angle),
            cosP = cos * padding, sinP = sin * padding, cosPSinP = cosP + sinP,
            cosPMinusSinP = cosP - sinP;
        if (padding) {
          tl.x -= cosPMinusSinP;
          tl.y -= cosPSinP;
          tr.x += cosPSinP;
          tr.y -= cosPMinusSinP;
          bl.x -= cosPSinP;
          bl.y += cosPMinusSinP;
          br.x += cosPMinusSinP;
          br.y += cosPSinP;
        }
        var ml  = new fabric.Point((tl.x + bl.x) / 2, (tl.y + bl.y) / 2),
            mt  = new fabric.Point((tr.x + tl.x) / 2, (tr.y + tl.y) / 2),
            mr  = new fabric.Point((br.x + tr.x) / 2, (br.y + tr.y) / 2),
            mb  = new fabric.Point((br.x + bl.x) / 2, (br.y + bl.y) / 2),
            mtr = new fabric.Point(mt.x + sin * this.rotatingPointOffset, mt.y - cos * this.rotatingPointOffset);
      }

      // if (!absolute) {
      //   var canvas = this.canvas;
      //   setTimeout(function() {
      //     canvas.contextTop.clearRect(0, 0, 700, 700);
      //     canvas.contextTop.fillStyle = 'green';
      //     canvas.contextTop.fillRect(mb.x, mb.y, 3, 3);
      //     canvas.contextTop.fillRect(bl.x, bl.y, 3, 3);
      //     canvas.contextTop.fillRect(br.x, br.y, 3, 3);
      //     canvas.contextTop.fillRect(tl.x, tl.y, 3, 3);
      //     canvas.contextTop.fillRect(tr.x, tr.y, 3, 3);
      //     canvas.contextTop.fillRect(ml.x, ml.y, 3, 3);
      //     canvas.contextTop.fillRect(mr.x, mr.y, 3, 3);
      //     canvas.contextTop.fillRect(mt.x, mt.y, 3, 3);
      //     canvas.contextTop.fillRect(mtr.x, mtr.y, 3, 3);
      //   }, 50);
      // }

      var coords = {
        // corners
        tl: tl, tr: tr, br: br, bl: bl,
      };
      if (!absolute) {
        // middle
        coords.ml = ml;
        coords.mt = mt;
        coords.mr = mr;
        coords.mb = mb;
        // rotating point
        coords.mtr = mtr;
      }
      return coords;
    },

    /**
     * Sets corner position coordinates based on current angle, width and height.
     * See {@link https://github.com/kangax/fabric.js/wiki/When-to-call-setCoords|When-to-call-setCoords}
     * @param {Boolean} [ignoreZoom] set oCoords with or without the viewport transform.
     * @param {Boolean} [skipAbsolute] skip calculation of aCoords, useful in setViewportTransform
     * @return {fabric.Object} thisArg
     * @chainable
     */
    setCoords: function(ignoreZoom, skipAbsolute) {
      this.oCoords = this.calcCoords(ignoreZoom);
      if (!skipAbsolute) {
        this.aCoords = this.calcCoords(true);
      }

      // set coordinates of the draggable boxes in the corners used to scale/rotate the image
      ignoreZoom || (this._setCornerCoords && this._setCornerCoords());

      return this;
    },

    /**
     * calculate rotation matrix of an object
     * @return {Array} rotation matrix for the object
     */
    _calcRotateMatrix: function() {
      return fabric.util.calcRotateMatrix(this);
    },

    /**
     * calculate the translation matrix for an object transform
     * @return {Array} rotation matrix for the object
     */
    _calcTranslateMatrix: function() {
      var center = this.getCenterPoint();
      return [1, 0, 0, 1, center.x, center.y];
    },

    transformMatrixKey: function(skipGroup) {
      var sep = '_', prefix = '';
      if (!skipGroup && this.group) {
        prefix = this.group.transformMatrixKey(skipGroup) + sep;
      };
      return prefix + this.top + sep + this.left + sep + this.scaleX + sep + this.scaleY +
        sep + this.skewX + sep + this.skewY + sep + this.angle + sep + this.originX + sep + this.originY +
        sep + this.width + sep + this.height + sep + this.strokeWidth + this.flipX + this.flipY;
    },

    /**
     * calculate transform matrix that represents the current transformations from the
     * object's properties.
     * @param {Boolean} [skipGroup] return transform matrix for object not counting parent transformations
     * @return {Array} transform matrix for the object
     */
    calcTransformMatrix: function(skipGroup) {
      if (skipGroup) {
        return this.calcOwnMatrix();
      }
      var key = this.transformMatrixKey(), cache = this.matrixCache || (this.matrixCache = {});
      if (cache.key === key) {
        return cache.value;
      }
      var matrix = this.calcOwnMatrix();
      if (this.group) {
        matrix = multiplyMatrices(this.group.calcTransformMatrix(), matrix);
      }
      cache.key = key;
      cache.value = matrix;
      return matrix;
    },

    /**
     * calculate transform matrix that represents the current transformations from the
     * object's properties, this matrix does not include the group transformation
     * @return {Array} transform matrix for the object
     */
    calcOwnMatrix: function() {
      var key = this.transformMatrixKey(true), cache = this.ownMatrixCache || (this.ownMatrixCache = {});
      if (cache.key === key) {
        return cache.value;
      }
      var tMatrix = this._calcTranslateMatrix();
      this.translateX = tMatrix[4];
      this.translateY = tMatrix[5];
      cache.key = key;
      cache.value = fabric.util.composeMatrix(this);
      return cache.value;
    },

    /*
     * Calculate object dimensions from its properties
     * @private
     * @deprecated since 3.4.0, please use fabric.util._calcDimensionsTransformMatrix
     * not including or including flipX, flipY to emulate the flipping boolean
     * @return {Object} .x width dimension
     * @return {Object} .y height dimension
     */
    _calcDimensionsTransformMatrix: function(skewX, skewY, flipping) {
      return fabric.util.calcDimensionsMatrix({
        skewX: skewX,
        skewY: skewY,
        scaleX: this.scaleX * (flipping && this.flipX ? -1 : 1),
        scaleY: this.scaleY * (flipping && this.flipY ? -1 : 1)
      });
    },

    /*
     * Calculate object dimensions from its properties
     * @private
     * @return {Object} .x width dimension
     * @return {Object} .y height dimension
     */
    _getNonTransformedDimensions: function() {
      var strokeWidth = this.strokeWidth,
          w = this.width + strokeWidth,
          h = this.height + strokeWidth;
      return { x: w, y: h };
    },

    /*
     * Calculate object bounding box dimensions from its properties scale, skew.
     * @param {Number} skewX, a value to override current skewX
     * @param {Number} skewY, a value to override current skewY
     * @private
     * @return {Object} .x width dimension
     * @return {Object} .y height dimension
     */
    _getTransformedDimensions: function(skewX, skewY) {
      if (typeof skewX === 'undefined') {
        skewX = this.skewX;
      }
      if (typeof skewY === 'undefined') {
        skewY = this.skewY;
      }
      var dimensions = this._getNonTransformedDimensions(), dimX, dimY,
          noSkew = skewX === 0 && skewY === 0;

      if (this.strokeUniform) {
        dimX = this.width;
        dimY = this.height;
      }
      else {
        dimX = dimensions.x;
        dimY = dimensions.y;
      }
      if (noSkew) {
        return this._finalizeDimensions(dimX * this.scaleX, dimY * this.scaleY);
      }
      else {
        dimX /= 2;
        dimY /= 2;
      }
      var points = [
            {
              x: -dimX,
              y: -dimY
            },
            {
              x: dimX,
              y: -dimY
            },
            {
              x: -dimX,
              y: dimY
            },
            {
              x: dimX,
              y: dimY
            }],
          transformMatrix = fabric.util.calcDimensionsMatrix({
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            skewX: this.skewX,
            skewY: this.skewY,
          }),
          bbox = fabric.util.makeBoundingBoxFromPoints(points, transformMatrix);
      return this._finalizeDimensions(bbox.width, bbox.height);
    },

    /*
     * Calculate object bounding box dimensions from its properties scale, skew.
     * @param Number width width of the bbox
     * @param Number height height of the bbox
     * @private
     * @return {Object} .x finalized width dimension
     * @return {Object} .y finalized height dimension
     */
    _finalizeDimensions: function(width, height) {
      return this.strokeUniform ?
        { x: width + this.strokeWidth, y: height + this.strokeWidth }
        :
        { x: width, y: height };
    },
    /*
     * Calculate object dimensions for controls, including padding and canvas zoom.
     * private
     */
    _calculateCurrentDimensions: function()  {
      var vpt = this.getViewportTransform(),
          dim = this._getTransformedDimensions(),
          p = fabric.util.transformPoint(dim, vpt, true);

      return p.scalarAdd(2 * this.padding);
    },
  });
})();
