const settings = {
    chat: {
        enabled: true,
    },
    current_watch: {
        "id": "",
        "link": "",
        "title": "",
        "time": 0.0,
        "max_time": 0.0
    }
};

chrome.storage.local.get(['chat_toggle'], function (result) {
    settings.chat.enabled = result.chat_toggle;
});

$(window).on('load', function () {

    setTimeout(() => {

        // Check if the page contains Sub only VOD message
        const checkSub = $("div[data-a-target='player-overlay-content-gate']");

        if (checkSub.length) {

            // Replace sub only message with a loading gif
            checkSub.html('<img src="https://i.ibb.co/NTpWgM1/Rolling-1s-200px.gif" alt="Loading VOD">');

            // Get the current twitch player
            const video = $("div[class*=persistent-player]");
            const className = video.attr("class");

            const vodID = window.location.toString().split("/").pop();

            settings.current_watch["link"] = vodID;

            // Fetch VOD data
            $.ajax({
                url: "https://api.twitch.tv/kraken/videos/" + vodID,
                headers: {
                    "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
                    "Accept": "application/vnd.twitchtv.v5+json"
                },
                type: 'GET',
                dataType: 'json',
                success: function (data, statut) {
                    if (statut === "success") {
                        const animated_preview_url = data.animated_preview_url;
                        const domain = animated_preview_url.split("/storyboards")[0].trim();

                        setTimeout(() => {
                            // Remove the current player
                            video.remove();

                            // Add on click event on every left tab channels
                            $("a[data-test-selector*='followed-channel']").click(() => {
                                on_click();
                            });

                            // Add on click event on every vods
                            $("img[src*='vods/']").click(() => {
                                on_click();
                            });

                            retrieveVOD(domain, className);
                        }, 1000);
                    }
                }
            });
        }
    }, 1500);
})

// Refresh current page on click to remove the extension player
function on_click() {
    setTimeout(() => {
        document.location.reload();
    }, 200);
}

function retrieveVOD(domain, className) {
    // Content twitch player
    const contentStream = $("div[data-target='persistent-player-content']");

    const key = domain.split("/")[3];
	
    const fullUrl = domain + "/360p30/index-dvr.m3u8";
	const fullUrl480 = domain + "/480p30/index-dvr.m3u8";
	const fullUrl720 = domain + "/720p60/index-dvr.m3u8";
	const fullUrlsource = domain + "/chunked/index-dvr.m3u8";
	const fullUrl160 = domain + "/160p30/index-dvr.m3u8";

    checkUrl(fullUrl).then((_, statut) => {
        if (statut === "success") {

            // Insert the new player
            contentStream.html(
                `<div data-setup="{}" preload="auto" class="video-js vjs-16-9 vjs-big-play-centered vjs-controls-enabled vjs-workinghover vjs-v7 player-dimensions vjs-has-started vjs-paused vjs-user-inactive ${className}" id="player" tabindex="-1" lang="en" role="region" aria-label="Video Player">
                    <video id="video" class="vjs-tech vjs-matrix" controls>
						<source src="${fullUrlsource}" type="application/x-mpegURL" id="vod4" res="source" label="source"selected="true">
						<source src="${fullUrl720}" type="application/x-mpegURL" id="vod3" res="720" label="720p60">
						<source src="${fullUrl480}" type="application/x-mpegURL" id="vod2" res="480" label="480p">
						<source src="${fullUrl}" type="application/x-mpegURL" id="vod" res="360" label="360p">
						<source src="${fullUrl160}" type="application/x-mpegURL" id="vod0" res="160" label="160p">
                    </video>
                </div>`
            );
			


            document.getElementById('video').onloadedmetadata = () => {
                settings.current_watch["title"] = $("h2[data-a-target='stream-title']").text();
                settings.current_watch["id"] = key;
                settings.current_watch["max_time"] = player.currentTime() + player.remainingTime();

                // Fetch current VOD time from background (local storage)
                chrome.runtime.sendMessage({ type: "fetch_data", id: key }, function (response) {
                    if (response.success) {
                        settings.current_watch["time"] = response.data["time"];

                        player.currentTime(settings.current_watch["time"]);
                    }
                });

                // Fetch current volume from local storage
                const volume = window.localStorage.getItem("volume");

                if (volume != undefined) {
                    player.volume(volume);
                }

                // Save new volume in local storage
                player.on('volumechange', () => {
                    window.localStorage.setItem("volume", player.volume());
                });

                // Save new time in local storage
                player.on('timeupdate', () => {
                    settings.current_watch["time"] = player.currentTime();

                    chrome.runtime.sendMessage({ type: "update_time", data: settings.current_watch }, function (response) { });
                });
            };

            // Add playback speed settings
            var player = videojs('video', {
                playbackRates: [0.5, 1, 1.25, 1.5, 2],
            });
			
			//Add quality selector
			videojs('video', {}, function() {
			var player = this;
			player.controlBar.addChild('QualitySelector');
			});

            // Patch the m3u8 VOD file to be readable
            videojs.Hls.xhr.beforeRequest = function (options) {
                options.uri = options.uri.replace('unmuted.ts', 'muted.ts');
                return options;
            };
	
            player.play();

            document.addEventListener('keydown', (event) => {
                const name = event.key;

                // Backward and forward with arrow keys
                if (name == "ArrowLeft") {
                    player.currentTime(player.currentTime() - 5);
                } else if (name == "ArrowRight") {
                    player.currentTime(player.currentTime() + 5);
                }
            }, false);

            if (!settings.chat.enabled) {
                return;
            }

            setTimeout(() => {
                let index = 0;

                let messages = {
                    "comments": []
                };

                fetchChat(player.currentTime(), undefined).done(data => {
                    messages = $.parseJSON(data);
                });

                setInterval(() => {
                    if (!player.paused() && messages != undefined && messages.comments.length > 0 && settings.chat.enabled) {

                        if (messages.comments.length == index) {
                            fetchChat(player.currentTime(), messages._next).done(data => {
                                messages = $.parseJSON(data);

                                index = 0;
                            });
                        }

                        messages.comments.forEach(comment => {
                            if (comment.content_offset_seconds <= player.currentTime()) {
                                addMessage(comment);
                                delete messages.comments[index];
                                index++;
                            }
                        });
                    }
                }, 1000);
            }, 1200);
        }
    });
}

function checkUrl(url) {
    return $.ajax({
        url: url,
        type: 'GET',
        dataType: 'html',
        async: false,
        success: function (_, statut) {
            return statut === "success";
        }
    });
}