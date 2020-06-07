import React from 'react';
import cloudinary, {Util} from 'cloudinary-core';
import CloudinaryComponent from '../CloudinaryComponent';
import {debounce, firstDefined, closestAbove, requestAnimationFrame, isElement} from '../../Util';

const defaultBreakpoints = (width, steps = 100) => {
  return steps * Math.ceil(width / steps);
};

/**
 * A component representing a Cloudinary served image
 */
class Image extends CloudinaryComponent {
  constructor(props, context) {
    super(props, context);
    this.handleResize = this.handleResize.bind(this);
    this.attachRef = this.attachRef.bind(this);
    this.getExtendedProps = this.getExtendedProps.bind(this);
    this.prepareState = this.prepareState.bind(this);

    let options = this.getExtendedProps(props, context);
    let state = {responsive: false, url: undefined, breakpoints: defaultBreakpoints};
    this.state = {...state, ...this.prepareState(options)};
  }

  /**
   * Retrieve the window or default view of the current element
   * @returns {DocumentView|*}
   * @private
   */
  get window() {
    let windowRef = null;
    if (typeof window !== "undefined") {
      windowRef = window
    }
    return (this.element && this.element.ownerDocument) ? (this.element.ownerDocument.defaultView || windowRef) : windowRef;
  }

  getExtendedProps(props = this.props, context = this.getContext()){
    return CloudinaryComponent.normalizeOptions(context, props);
  }

  prepareState(options = this.getExtendedProps()) {
    let url = this.getUrl(options);
    let state = {};
    let updatedOptions = {};

    if (options.breakpoints !== undefined) {
      state.breakpoints = options.breakpoints;
    }
    if (options.responsive) {
      state.responsive = true;
      updatedOptions = this.cloudinaryUpdate(url, state);
      url = updatedOptions.url;
    }

    let currentState = this.state || {};

    state.width = updatedOptions.width;

    if (!Util.isEmpty(url) && url !== currentState.url) {
      state.url = url;
    }

    return state;
  }

  attachRef(element) {
    this.element = element;
    const {innerRef} = this.props;

    if (innerRef) {
      if (innerRef instanceof Function) {
        innerRef(element);
      } else {
        innerRef.current = element;
      }
    }
  }

  handleResize() {
    if (!this.props.responsive || this.rqf) return;
    this.rqf = requestAnimationFrame(() => {
      this.rqf = null;
      let newState = this.prepareState();
      if (!Util.isEmpty(newState.url)) {
        this.setState(newState);
      }
    });
  }

  componentDidMount() {
    const {loading} = this.getExtendedProps();
    if (loading && loading !== "eager") {
      Util.detectIntersection(this.element, this.onIntersect);
    }
    // now that we have a this.element, we need to calculate the URL
    this.handleResize();
  }

  componentWillUnmount() {
    this.element = undefined;
    if (this.listener) {
      this.listener.cancel();
      this.window && this.window.removeEventListener('resize', this.listener);
    }
    this.listener = undefined;
  }

  componentDidUpdate(prevProps) {
    this.setState(this.prepareState());
    if (this.state.responsive) {
      const wait = firstDefined(this.props.responsiveDebounce, this.getContext().responsiveDebounce, 100);
      if (this.listener) {
        this.window && this.window.removeEventListener('resize', this.listener);
      }
      this.listener = debounce(this.handleResize, wait);
      this.window && this.window.addEventListener('resize', this.listener);
    }
  }

  render() {
    const {publicId, responsive, responsiveDebounce, children, innerRef, ...options} = this.getExtendedProps();
    const attributes = cloudinary.Transformation.new(options).toHtmlAttributes();
    const {url, isInView} = this.state;
    const shouldRender = !options.loading || options.loading === "eager" || isInView;
    const srcAttributeName = shouldRender ? "src" : "data-src";

    let imageProps = {...attributes, ref: this.attachRef};
    imageProps[srcAttributeName] = url;

    return <img {...imageProps} />;
  }

  // Methods from cloudinary_js

  findContainerWidth() {
    var containerWidth, style;
    containerWidth = 0;
    let element = this.element;
    while (isElement((element = element != null ? element.parentNode : void 0)) && !containerWidth) {
      style = this.window ? this.window.getComputedStyle(element) : '';
      if (!/^inline/.test(style.display)) {
        containerWidth = Util.width(element);
      }
    }
    return Math.round(containerWidth);
  };

  applyBreakpoints(width, steps, options) {
    options = CloudinaryComponent.normalizeOptions(this.getContext(), this.props, options);
    let responsiveUseBreakpoints = options.responsiveUseBreakpoints;
    if ((!responsiveUseBreakpoints) || (responsiveUseBreakpoints === 'resize' && !options.resizing)) {
      return width;
    } else {
      return this.calc_breakpoint(width, steps);
    }
  };

  calc_breakpoint(width, steps) {
    var breakpoints, point;
    breakpoints = (this.state && this.state.breakpoints) || defaultBreakpoints;
    if (Util.isFunction(breakpoints)) {
      return breakpoints(width, steps);
    } else {
      if (Util.isString(breakpoints)) {
        breakpoints = ((function () {
          var j, len, ref, results;
          ref = breakpoints.split(',');
          results = [];
          for (j = 0, len = ref.length; j < len; j++) {
            point = ref[j];
            results.push(parseInt(point));
          }
          return results;
        })()).sort(function (a, b) {
          return a - b;
        });
      }
      return closestAbove(breakpoints, width);
    }
  };

  device_pixel_ratio(roundDpr = true) {
    var dpr, dprString;
    dpr = (typeof this.window !== "undefined" && this.window !== null ? this.window.devicePixelRatio : void 0) || 1;
    if (roundDpr) {
      dpr = Math.ceil(dpr);
    }
    if (dpr <= 0 || isNaN(dpr)) {
      dpr = 1;
    }
    dprString = dpr.toString();
    if (dprString.match(/^\d+$/)) {
      dprString += '.0';
    }
    return dprString;
  };

  updateDpr(dataSrc, roundDpr) {
    return dataSrc.replace(/\bdpr_(1\.0|auto)\b/g, 'dpr_' + this.device_pixel_ratio(roundDpr));
  };

  maxWidth(requiredWidth) {
    return Math.max((this.state && this.state.width) || 0, requiredWidth);
  };

  cloudinaryUpdate(url, options = {}) {
    var requiredWidth;
    var match;
    let resultUrl = this.updateDpr(url, options.roundDpr);
    if (options.responsive || this.state && this.state.responsive) {
      let containerWidth = this.findContainerWidth();
      if (containerWidth !== 0) {
        if (/w_auto:breakpoints/.test(resultUrl)) {
          requiredWidth = this.maxWidth(containerWidth, this.element);
          resultUrl = resultUrl.replace(/w_auto:breakpoints([_0-9]*)(:[0-9]+)?/,
            "w_auto:breakpoints$1:" + requiredWidth);
        } else {
          match = /w_auto(:(\d+))?/.exec(resultUrl);
          if (match) {
            requiredWidth = this.applyBreakpoints(containerWidth, match[2], options);
            requiredWidth = this.maxWidth(requiredWidth, this.element);
            resultUrl = resultUrl.replace(/w_auto[^,\/]*/g, "w_" + requiredWidth);
          }
        }
      } else {
        resultUrl = "";
      }
    }
    return {url: resultUrl, width: requiredWidth};
  }
}

Image.defaultProps = {};
Image.propTypes = CloudinaryComponent.propTypes;

export default Image;
