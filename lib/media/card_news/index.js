const { renderCardNewsSet } = require('./render');
const { buildSlideDescriptors, SLIDE_FILENAMES } = require('./slides');
const { buildCardNewsContent } = require('./content_map');
const { verifyCardNewsSet } = require('./verify');
const { PALETTE, FONTS, CANVAS, PAGE_TOTAL } = require('./palette');

module.exports = {
  renderCardNewsSet,
  buildSlideDescriptors,
  buildCardNewsContent,
  verifyCardNewsSet,
  SLIDE_FILENAMES,
  PALETTE,
  FONTS,
  CANVAS,
  PAGE_TOTAL
};
