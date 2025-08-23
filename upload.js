// upload.js
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: 'dyphnft3g',
  api_key: '748585952159255',
  api_secret: 'mZtws_UDPtyr--fiztbDisRbBq4',
});

const file = process.argv[2];
(async () => {
  try {
    const res = await cloudinary.uploader.upload(file, {
      resource_type: 'raw',
      public_id: 'consultation-form',
      use_filename: true,
      unique_filename: false,
      overwrite: true,
      type: 'upload',
    });
    console.log('SECURE_URL:', res.secure_url);
  } catch (e) {
    console.error('Upload failed:', e.error || e);
  }
})();
