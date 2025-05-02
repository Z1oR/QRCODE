const PayButton = document.querySelector('.payment')

PayButton.addEventListener('click', () => {
    // Create scanning frame
    const frame = document.createElement('div');
    frame.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 250px;
        height: 250px;
        border: 2px solid #00ff00;
        z-index: 1000;
        pointer-events: none;
    `;
    
    // Add corner markers
    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    corners.forEach(corner => {
        const marker = document.createElement('div');
        marker.style.cssText = `
            position: absolute;
            width: 20px;
            height: 20px;
            border: 2px solid #00ff00;
            ${corner.includes('top') ? 'top: 0;' : 'bottom: 0;'}
            ${corner.includes('left') ? 'left: 0;' : 'right: 0;'}
            border-${corner.includes('top') ? 'bottom' : 'top'}: none;
            border-${corner.includes('left') ? 'right' : 'left'}: none;
        `;
        frame.appendChild(marker);
    });

    // Check if browser supports getUserMedia
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Request camera access
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(function(stream) {
                // Create video element
                const video = document.createElement('video');
                document.body.appendChild(video);
                video.srcObject = stream;
                video.setAttribute('playsinline', true);
                video.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                `;
                video.play();

                // Add scanning frame to the page
                document.body.appendChild(frame);

                // Create canvas for QR scanning
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                let scanning = true;

                // Scan QR code
                function scan() {
                    if (video.readyState === video.HAVE_ENOUGH_DATA && scanning) {
                        canvas.height = video.videoHeight;
                        canvas.width = video.videoWidth;
                        context.drawImage(video, 0, 0, canvas.width, canvas.height);
                        
                        try {
                            const code = jsQR(
                                context.getImageData(0, 0, canvas.width, canvas.height).data,
                                canvas.width,
                                canvas.height
                            );
                            
                            if (code) {
                                console.log("Found QR code:", code.data);
                                scanning = false;
                                stream.getTracks().forEach(track => track.stop());
                                video.remove();
                                frame.remove();
                                // Handle the QR code data here
                                alert("QR Code detected: " + code.data);
                            }
                        } catch (e) {
                            console.error("QR scanning error:", e);
                        }
                    }
                    if (scanning) {
                        requestAnimationFrame(scan);
                    }
                }

                requestAnimationFrame(scan);
            })
            .catch(function(error) {
                console.error("Camera error:", error);
                alert("Could not access camera. Please ensure you have given permission.");
            });
    } else {
        alert("Sorry, your browser does not support camera access");
    }
})


