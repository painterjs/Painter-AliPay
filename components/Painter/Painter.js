import * as Painter from 'painter-kernel';
import Downloader from './lib/downloader'
import WxCanvas from './lib/wx-canvas'
import {isValidUrl, isOnlineUrl, isDataUrl, equal} from './lib/util'

const downloader = new Downloader();

// 最大尝试的绘制次数
const MAX_PAINT_COUNT = 5;
const ACTION_DEFAULT_SIZE = 24;
const ACTION_OFFSET = '2rpx';

 
Component({
  imgSize:{},
  canvasWidthInPx: 0,
  canvasHeightInPx: 0,
  canvasNode: null,
  paintCount: 0,
  currentPalette: {},
  outterDisabled: false,
  isDisabled: false,
  needClear: false,
  count:0,
  /**
   * 组件的属性列表
   */
  props: {
    use2D: false,
    scaleRatio: 1,
    dirty:false,
    LRU:  false,
    disableAction: false,
    clearActionBox: false,

  },
  deriveDataFromProps(nextProps) { // 组件创建时触发或更新时触发

    if(nextProps.dancePalette !== undefined && nextProps.dancePalette !== this.props.dancePalette) {

        if (!this.isEmpty(nextProps.dancePalette) && !nextProps.use2D) {
            Painter.clearPenCache();
            this.initDancePalette(nextProps);
          }
      
    }

    if(nextProps.palette !== undefined && this.props.palette !== nextProps.palette){
      if (this.isNeedRefresh(nextProps.palette, this.props.palette)) {
          this.paintCount = 0;
          Painter.clearPenCache();
          this.startPaint(nextProps);
        }
    }
    
    if(nextProps.action !== undefined){
 
          if (nextProps.action && !this.isEmpty(nextProps.action) && !this.props.use2D) {
            this.doAction(nextProps.action, null, false, true);
        
    }
    }
    if(nextProps.disableAction !== undefined){
      this.outterDisabled = nextProps.isDisabled;
      this.isDisabled = nextProps.isDisabled;
    }
    
    if(nextProps.clearActionBox !== undefined){
      if (nextProps.clearActionBox && !this.needClear) {
        if (this.frontContext) {
          setTimeout(() => {
            this.frontContext.draw();
          }, 100);
          this.touchedView = {};
          this.prevFindedIndex = this.findedIndex;
          this.findedIndex = -1;
        }
      }
      this.needClear = nextProps.clearActionBox;
    }

  },
  onInit () {
    let that = this
    that.imgSize = {}
    Painter.initInjection({
      loadImage: async url => {
        return new Promise(resolve => {
          if (!that.imgSize[url]) {
            my.getImageInfo({
              src: url,
              success: res => {
                // 获得一下图片信息，供后续裁减使用
                that.imgSize[url] = {
                  img: url,
                  width: res.width,
                  height: res.height,
                };
                resolve(that.imgSize[url]);
              },
              fail: error => {
                // 如果图片坏了，则直接置空，防止坑爹的 canvas 画崩溃了
                resolve({
                  img: '',
                  width: 0,
                  height: 0,
                });
                console.error(`getImageInfo ${url} failed, ${JSON.stringify(error)}`);
              },
            });
          } else {
            resolve(that.imgSize[url]);
          }
        });
      },
      getRatio: function () {
        const systemInfo = my.getSystemInfoSync();
        return systemInfo.pixelRatio;
      }
    });
  },
  data: {
    picURL: '',
    showCanvas: true,
    painterStyle: '',
  },

  methods: {
    /**
     * 判断一个 object 是否为 空
     * @param {object} object
     */
    isEmpty(object) {
      for (const i in object) {
        return false;
      }
      return true;
    },

    isNeedRefresh(newVal, oldVal) {
      if (!newVal || this.isEmpty(newVal) || (this.data.dirty && equal(newVal, oldVal))) {
        return false;
      }
      return true;
    },

    //返回一个方块的IVIEW
    getBox(rect, type) {
      const boxArea = {
        type: 'rect',
        css: {
          height: `${rect.bottom - rect.top}px`,
          width: `${rect.right - rect.left}px`,
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          borderWidth: '4rpx',
          borderColor: '#1A7AF8',
          color: 'transparent',
        },
      };
      if (type === 'text') {
        boxArea.css = Object.assign({}, boxArea.css, {
          borderStyle: 'dashed',
        });
      }
      if (this.props.customActionStyle && this.props.customActionStyle.border) {
        boxArea.css = Object.assign({}, boxArea.css, this.props.customActionStyle.border);
      }
      Object.assign(boxArea, {
        id: 'box',
      });
      return boxArea;
    },
    
    // 默认缩放图片有关的IVIEW
    getScaleIcon(rect, type) {
      let scaleArea = {};
      const { customActionStyle } = this.props;
      if (customActionStyle && customActionStyle.scale) {
        scaleArea = {
          type: 'image',
          url: type === 'text' ? customActionStyle.scale.textIcon : customActionStyle.scale.imageIcon,
          css: {
            height: `${2 * ACTION_DEFAULT_SIZE}rpx`,
            width: `${2 * ACTION_DEFAULT_SIZE}rpx`,
            borderRadius: `${ACTION_DEFAULT_SIZE}rpx`,
          },
        };
      } else {
        scaleArea = {
          type: 'rect',
          css: {
            height: `${2 * ACTION_DEFAULT_SIZE}rpx`,
            width: `${2 * ACTION_DEFAULT_SIZE}rpx`,
            borderRadius: `${ACTION_DEFAULT_SIZE}rpx`,
            color: '#0000ff',
          },
        };
      }
      scaleArea.css = Object.assign({}, scaleArea.css, {
        align: 'center',
        left: `${rect.right + Painter.toPx(ACTION_OFFSET)}px`,
        top:
          type === 'text'
            ? `${rect.top - Painter.toPx(ACTION_OFFSET) - Painter.toPx(scaleArea.css.height) / 2}px`
            : `${rect.bottom - Painter.toPx(ACTION_OFFSET) - Painter.toPx(scaleArea.css.height) / 2}px`,
      });
      Object.assign(scaleArea, {
        id: 'scale',
      });
      return scaleArea;
    },

    // 删除图标的默认VIEW
    getDeleteIcon(rect) {
      let deleteArea = {};
      const { customActionStyle } = this.props;
      if (customActionStyle && customActionStyle.scale) {
        deleteArea = {
          type: 'image',
          url: customActionStyle.delete.icon,
          css: {
            height: `${2 * ACTION_DEFAULT_SIZE}rpx`,
            width: `${2 * ACTION_DEFAULT_SIZE}rpx`,
            borderRadius: `${ACTION_DEFAULT_SIZE}rpx`,
          },
        };
      } else {
        deleteArea = {
          type: 'rect',
          css: {
            height: `${2 * ACTION_DEFAULT_SIZE}rpx`,
            width: `${2 * ACTION_DEFAULT_SIZE}rpx`,
            borderRadius: `${ACTION_DEFAULT_SIZE}rpx`,
            color: '#0000ff',
          },
        };
      }
      deleteArea.css = Object.assign({}, deleteArea.css, {
        align: 'center',
        left: `${rect.left -Painter.toPx( ACTION_OFFSET)}px`,
        top: `${rect.top - Painter.toPx( ACTION_OFFSET) -Painter.toPx( deleteArea.css.height) / 2}px`,
      });
      Object.assign(deleteArea, {
        id: 'delete',
      });
      return deleteArea;
    },
    // doAction(newVal, null, false, true);
    doAction(action, callback, isMoving, overwrite) {
      if (this.props.use2D) {
        return;
      }
      let newVal = null;
      if (action) {
        newVal = action.view;
      }
      if (newVal && newVal.id && this.touchedView.id !== newVal.id) {
        // 带 id 的动作给撤回时使用，不带 id，表示对当前选中对象进行操作
        const { views } = this.currentPalette;
        for (let i = 0; i < views.length; i++) {
          if (views[i].id === newVal.id) {
            // 跨层回撤，需要重新构建三层关系
            this.touchedView = views[i];
            this.findedIndex = i;
            this.sliceLayers();
            break;
          }
        }
      }

      const doView = this.touchedView;

      if (!doView || this.isEmpty(doView)) {
        return;
      }
      if (newVal && newVal.css) {
        if (overwrite) {
          doView.css = newVal.css;
        } else if (Array.isArray(doView.css) && Array.isArray(newVal.css)) {
          doView.css = Object.assign({}, ...doView.css, ...newVal.css);
        } else if (Array.isArray(doView.css)) {
          doView.css = Object.assign({}, ...doView.css, newVal.css);
        } else if (Array.isArray(newVal.css)) {
          doView.css = Object.assign({}, doView.css, ...newVal.css);
        } else {
          doView.css = Object.assign({}, doView.css, newVal.css);
        }
      }
      if (newVal && newVal.rect) {
        doView.rect = newVal.rect;
      }
      if (newVal && newVal.url && doView.url && newVal.url !== doView.url) {
        downloader
          .download(newVal.url, this.props.LRU)
          .then(path => {
            if (newVal.url.startsWith('https')) {
              doView.originUrl = newVal.url;
            }
            doView.url = path;
            my.getImageInfo({
              src: path,
              success: res => {
                doView.sHeight = res.height;
                doView.sWidth = res.width;
                this.reDraw(doView, callback, isMoving);
              },
              fail: () => {
                this.reDraw(doView, callback, isMoving);
              },
            });
          })
          .catch(error => {
            // 未下载成功，直接绘制
            console.error(error);
            this.reDraw(doView, callback, isMoving);
          });
      } else {
        newVal && newVal.text && doView.text && newVal.text !== doView.text && (doView.text = newVal.text);
        newVal &&
          newVal.content &&
          doView.content &&
          newVal.content !== doView.content &&
          (doView.content = newVal.content);
        this.reDraw(doView, callback, isMoving);
      }
    },

    reDraw(doView, callback, isMoving) {
      const draw = {
        width: this.currentPalette.width,
        height: this.currentPalette.height,
        views: this.isEmpty(doView) ? [] : [doView],
      };
      const pen = new Painter.Pen(this.globalContext, draw);

      pen.paint(callbackInfo => {
        this.globalContext.draw()
        callback && callback(callbackInfo);
        this.props.onViewUpdate && this.props.onViewUpdate({view: this.touchedView})
      });

      const { rect, css, type } = doView;

      this.block = {
        width: this.currentPalette.width,
        height: this.currentPalette.height,
        views: this.isEmpty(doView) ? [] : [this.getBox(rect, doView.type)],
      };
      if (css && css.scalable) {
        this.block.views.push(this.getScaleIcon(rect, type));
      }
      if (css && css.deletable) {
        this.block.views.push(this.getDeleteIcon(rect));
      }
      const topBlock = new Painter.Pen(this.frontContext, this.block);
      topBlock.paint(() => {
        this.frontContext.draw()
      });
    },

    isInView(x, y, rect) {
      return x > rect.left && y > rect.top && x < rect.right && y < rect.bottom;
    },

    isInDelete(x, y) {
      for (const view of this.block.views) {
        if (view.id === 'delete') {
          return x > view.rect.left && y > view.rect.top && x < view.rect.right && y < view.rect.bottom;
        }
      }
      return false;
    },

    isInScale(x, y) {
      for (const view of this.block.views) {
        if (view.id === 'scale') {
          return x > view.rect.left && y > view.rect.top && x < view.rect.right && y < view.rect.bottom;
        }
      }
      return false;
    },

    touchedView: {},
    findedIndex: -1,
    onClick() {
      const x = this.startX;
      const y = this.startY;
      const totalLayerCount = this.currentPalette.views.length;
      let canBeTouched = [];
      let isDelete = false;
      let deleteIndex = -1;
      for (let i = totalLayerCount - 1; i >= 0; i--) {
        const view = this.currentPalette.views[i];

        const { rect } = view;
        if (this.touchedView && this.touchedView.id && this.touchedView.id === view.id && this.isInDelete(x, y, rect)) {
          canBeTouched.length = 0;
          deleteIndex = i;
          isDelete = true;
          break;
        }
        if (this.isInView(x, y, rect)) {
          canBeTouched.push({
            view,
            index: i,
          });
        }
      }
      this.touchedView = {};
      if (canBeTouched.length === 0) {
        this.findedIndex = -1;
      } else {
        let i = 0;
        const touchAble = canBeTouched.filter(item => Boolean(item.view.id));
        if (touchAble.length === 0) {
          this.findedIndex = canBeTouched[0].index;
        } else {
          for (i = 0; i < touchAble.length; i++) {
            if (this.findedIndex === touchAble[i].index) {
              i++;
              break;
            }
          }
          if (i === touchAble.length) {
            i = 0;
          }
          this.touchedView = touchAble[i].view;
          this.findedIndex = touchAble[i].index;
          this.props.onViewClicked && this.props.onViewClicked({view: this.touchedView})
        }
      }
      if (this.findedIndex < 0 || (this.touchedView && !this.touchedView.id)) {
        // 证明点击了背景 或无法移动的view
        this.frontContext.draw();
        if (isDelete) {
          this.props.onTouchend && this.props.onTouchend({
            view: this.currentPalette.views[deleteIndex],
            index: deleteIndex,
            type: 'delete',
          })
          this.doAction();
        } else if (this.findedIndex < 0) {
          // this.triggerEvent('viewClicked', {});
          this.props.onViewClicked && this.props.onViewClicked({})
        }
        this.findedIndex = -1;
        this.prevFindedIndex = -1;
      } else if (this.touchedView && this.touchedView.id) {
        this.sliceLayers();
      }
    },
     
    // 根据VIEW的切换和分层选择渲染的方式
    sliceLayers() {
      const bottomLayers = this.currentPalette.views.slice(0, this.findedIndex);
      const topLayers = this.currentPalette.views.slice(this.findedIndex + 1);
      const bottomDraw = {
        width: this.currentPalette.width,
        height: this.currentPalette.height,
        background: this.currentPalette.background,
        views: bottomLayers,
      };
      const topDraw = {
        width: this.currentPalette.width,
        height: this.currentPalette.height,
        views: topLayers,
      };
      if (this.prevFindedIndex < this.findedIndex) {
        new Painter.Pen(this.bottomContext, bottomDraw).paint(() => {
          this.bottomContext.draw()
        });
        this.doAction();
        new Painter.Pen(this.topContext, topDraw).paint(() => {
          this.topContext.draw()
        });
      } else {
        new Painter.Pen(this.topContext, topDraw).paint(() => {
          this.topContext.draw()
        });
        this.doAction();
        new Painter.Pen(this.bottomContext, bottomDraw).paint(() => {
          this.bottomContext.draw()
        });
      }
      this.prevFindedIndex = this.findedIndex;
    },

    startX: 0,
    startY: 0,
    startH: 0,
    startW: 0,
    isScale: false,
    startTimeStamp: 0,

    onTouchStart(event) {
      if (this.isDisabled) {
        return;
      }
      const { x, y } = event.touches[0];
      this.startX = x;
      this.startY = y;
      this.startTimeStamp = new Date().getTime();
      if (this.touchedView && !this.isEmpty(this.touchedView)) {
        const { rect } = this.touchedView;
        if (this.isInScale(x, y, rect)) {
          this.isScale = true;
          this.startH = rect.bottom - rect.top;
          this.startW = rect.right - rect.left;
        } else {
          this.isScale = false;
        }
      } else {
        this.isScale = false;
      }
    },

    onTouchEnd(e) {
      if (this.isDisabled) {
        return;
      }
      const current = new Date().getTime();
      if (current - this.startTimeStamp <= 500 && !this.hasMove) {
        !this.isScale && this.onClick(e);
      } else if (this.touchedView && !this.isEmpty(this.touchedView)) {
        this.props.onTouchend && this.props.onTouchend({view: this.touchedView})
      }
      this.hasMove = false;
    },

    onTouchCancel(e) {
      if (this.isDisabled) {
        return;
      }
      this.onTouchEnd(e);
    },
    
 
    hasMove: false,
    onTouchMove(event) {
      if (this.isDisabled) {
        return;
      }
      this.hasMove = true;
      if (!this.touchedView || (this.touchedView && !this.touchedView.id)) {
        return;
      }
      const { x, y } = event.touches[0];
      const offsetX = x - this.startX;
      const offsetY = y - this.startY;
      const { rect, type } = this.touchedView;
      let css = {};
      if (this.isScale) {
        Painter.clearPenCache(this.touchedView.id);
        const newW = this.startW + offsetX > 1 ? this.startW + offsetX : 1;
        if (this.touchedView.css && this.touchedView.css.minWidth) {
          if (newW < Painter.toPx(this.touchedView.css.minWidth)) {
            return;
          }
        }
        if (this.touchedView.rect && this.touchedView.rect.minWidth) {
          if (newW < this.touchedView.rect.minWidth) {
            return;
          }
        }
        const newH = this.startH + offsetY > 1 ? this.startH + offsetY : 1;
        css = {
          width: `${newW}px`,
        };
        if (type !== 'text') {
          if (type === 'image') {
            css.height = `${(newW * this.startH) / this.startW}px`;
          } else {
            css.height = `${newH}px`;
          }
        }
      } else {
        this.startX = x;
        this.startY = y;
        css = {
          left: `${rect.x + offsetX}px`,
          top: `${rect.y + offsetY}px`,
          right: undefined,
          bottom: undefined,
        };
      }
      this.doAction(
        {
          view: {
            css,
          },
        },
        null,
        !this.isScale,
      );
    },

    //确定 screenK 
    initScreenK() {
      if (!(getApp() && getApp().systemInfo && getApp().systemInfo.screenWidth)) {  //屏幕宽度单位是px
        try {
          getApp().systemInfo = my.getSystemInfoSync();
        } catch (e) {
          console.error(`Painter get system info failed, ${JSON.stringify(e)}`);
          return;
        }
      }
      this.screenK = 0.5;
      if (getApp() && getApp().systemInfo && getApp().systemInfo.screenWidth) {
        this.screenK = getApp().systemInfo.screenWidth / 750;
      }
      Painter.setStringPrototype(this.screenK, this.props.scaleRatio);
    },

    initDancePalette(nextProps) {
      if (this.props.use2D) {
        return;
      }
      this.isDisabled = true;
      this.initScreenK();
      this.downloadImages(nextProps.dancePalette).then(async palette => {
        this.currentPalette = palette;
        const { width, height } = palette;

        if (!width || !height) {
          console.error(`You should set width and height correctly for painter, width: ${width}, height: ${height}`);
          return;
        }
        this.setData({
          painterStyle: `width:${Painter.toPx(width)}px;height:${Painter.toPx(height)}px;`,
        });
        this.frontContext || (this.frontContext = await this.getCanvasContext(this.props.use2D, 'front'));
        this.bottomContext || (this.bottomContext = await this.getCanvasContext(this.props.use2D, 'bottom'));
        this.topContext || (this.topContext = await this.getCanvasContext(this.props.use2D, 'top'));
        this.globalContext || (this.globalContext = await this.getCanvasContext(this.props.use2D, 'k-canvas'));

        new Painter.Pen(this.bottomContext, palette).paint(() => {
          this.isDisabled = this.outterDisabled;
          this.bottomContext.draw();
          this.props.onDidShow && this.props.onDidShow()
        });
        this.globalContext.draw();
        this.frontContext.draw();
        this.topContext.draw();
      });
      this.touchedView = {};
      
    },

    startPaint(nextProps) {
      this.initScreenK();
      const { width, height } = nextProps.palette;

      if (!width || !height) {
        console.error(`You should set width and height correctly for painter, width: ${width}, height: ${height}`);
        return;
      }

      let needScale = false;
      // 生成图片时，根据设置的像素值重新绘制
      if (Painter.toPx(width) !== this.canvasWidthInPx) {
        this.canvasWidthInPx = Painter.toPx(width);
        // this.canvasWidthInPx = width.toPx();
        needScale = this.props.use2D;
      }
      if (this.props.widthPixels) {
        Painter.setStringPrototype(this.screenK, this.props.widthPixels / this.canvasWidthInPx);
        // setStringPrototype(this.screenK, this.props.widthPixels / this.canvasWidthInPx);
        this.canvasWidthInPx = this.props.widthPixels;
      }

      if (this.canvasHeightInPx !== Painter.toPx(height)) {
        this.canvasHeightInPx = Painter.toPx(height);
        // this.canvasHeightInPx = height.toPx();
        needScale = needScale || this.props.use2D;
      }
      this.setData(
        {
          photoStyle: `width:${this.canvasWidthInPx}px;height:${this.canvasHeightInPx}px;`,
        },
        () => {
          
          this.downloadImages(nextProps.palette).then(async palette => {

            if (!this.photoContext) {
              this.photoContext = await this.getCanvasContext(this.props.use2D, 'photo');
            }
            if (needScale) {
              const scale = getApp().systemInfo.pixelRatio;
              this.photoContext.width = this.canvasWidthInPx * scale;
              this.photoContext.height = this.canvasHeightInPx * scale;
              this.photoContext.scale(scale, scale);
            }
            new Painter.Pen(this.photoContext, palette).paint(() => {
              this.photoContext.draw()
              this.saveImgToLocal();

            });
            Painter.setStringPrototype(this.screenK, this.props.scaleRatio);
          });
        }
        
      );
    },

    // LRU机制下载图片
    downloadImages(palette) {
      return new Promise((resolve, reject) => {
        let preCount = 0;
        let completeCount = 0;
        const paletteCopy = JSON.parse(JSON.stringify(palette));
        if (paletteCopy.background) {
          preCount++;
          downloader.download(paletteCopy.background, this.props.LRU).then(
            path => {
              paletteCopy.background = path;
              completeCount++;
              if (preCount === completeCount) {
                resolve(paletteCopy);
              }
            },
            () => {
              completeCount++;
              if (preCount === completeCount) {
                resolve(paletteCopy);
              }
            },
          );
        }
        if (paletteCopy.views) {
          for (const view of paletteCopy.views) {
            if (view && view.type === 'image' && view.url) {
              preCount++;
              /* eslint-disable no-loop-func */
              downloader.download(view.url, this.props.LRU).then(
                path => {
                  view.originUrl = view.url;
                  view.url = path;
                  my.getImageInfo({
                    src: path,
                    success: res => {
                      // 获得一下图片信息，供后续裁减使用
                      view.sWidth = res.width;
                      view.sHeight = res.height;
                    },
                    fail: error => {
                      // 如果图片坏了，则直接置空，防止坑爹的 canvas 画崩溃了
                      console.warn(`getImageInfo ${view.originUrl} failed, ${JSON.stringify(error)}`);
                      view.url = '';
                    },
                    complete: () => {
                      completeCount++;
                      if (preCount === completeCount) {
                        resolve(paletteCopy);
                      }
                    },
                  });
                },
                () => {
                  completeCount++;
                  if (preCount === completeCount) {
                    resolve(paletteCopy);
                  }
                },
              );
            }
          }
        }
        if (preCount === 0) {
          resolve(paletteCopy);
        }
      });
    },

    saveImgToLocal(use2D) {
  
      const that = this;
      let photoCtx = my.createCanvasContext('photo')
      // let photoCtx = Canvas.getContext('2d')

      setTimeout(() => {
        photoCtx.toTempFilePath(
          {
            destWidth: that.canvasWidthInPx,
            destHeight: that.canvasHeightInPx,
            success (res) {
              that.getImageInfo(res.apFilePath);
            },
            fail (error) {
              console.error(`canvasToTempFilePath failed, ${JSON.stringify(error)}`);
              that.props.onImgErr && that.props.onImgErr(error)
            }
          }
        );
      }, 300);
    },

    // 创建不同的画布
    getCanvasContext(use2D, id) {
      const that = this;
      return new Promise(resolve => {
        if (use2D) {
          const query = my.createSelectorQuery();
          const selectId = `#${id}`;
          query
            .select(selectId)
            .fields({ node: true, size: true })
            .exec(res => {
              that.canvasNode = res[0].node;
              const ctx = that.canvasNode.getContext('2d');
              const wxCanvas = new WxCanvas('2d', ctx, id, true, that.canvasNode);
              resolve(wxCanvas);
            });
        } else {

          const temp = my.createCanvasContext(id);
          // console.log(temp)
          resolve(new WxCanvas('mina', temp, id, true));
        }
      });
    },

    getImageInfo(filePath) {
      const that = this;
      my.getImageInfo({
        src: filePath,
        success: infoRes => {
          if (that.paintCount > MAX_PAINT_COUNT) {
            const error = `The result is always fault, even we tried ${MAX_PAINT_COUNT} times`;
            console.error(error);
            that.props.onImgErr && that.props.onImgErr(error)
            return;
          }
          // 比例相符时才证明绘制成功，否则进行强制重绘制
          if (
            Math.abs(
              (infoRes.width * that.canvasHeightInPx - that.canvasWidthInPx * infoRes.height) /
                (infoRes.height * that.canvasHeightInPx),
            ) < 0.01
          ) {
            that.props.onImgOK && that.props.onImgOK(filePath)
          } else {
            that.startPaint();
          }
          that.paintCount++;
        },
        fail: error => {
          console.error(`getImageInfo failed, ${JSON.stringify(error)}`);
          that.props.onImgErr && that.props.onImgErr(error)
        },
      });
    },
  },
});


