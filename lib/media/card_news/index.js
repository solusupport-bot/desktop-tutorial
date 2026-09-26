const { renderCardNewsSet } = require('./render');
const { buildSlideDescriptors } = require('./slides');
const { buildCardNewsContent } = require('./content_map');
const { PALETTE, FONTS, CANVAS, PAGE_TOTAL } = require('./palette');

module.exports = {
  renderCardNewsSet,
  buildSlideDescriptors,
  buildCardNewsContent,
  PALETTE,
  FONTS,
  CANVAS,
  PAGE_TOTAL
};
