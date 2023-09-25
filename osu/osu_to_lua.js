var parser = module.require("osuparser");
var format = module.require('format');

module.export("osu_to_lua", function(osu_file_contents, options) {
	var rtv_lua = ""

	var append_to_output = function(str, newline) {
		rtv_lua += (str)
	}

	var beatmap = parser.parseContent(osu_file_contents)

	function track_time_hash(track,time) {
		return track + "_" + time
	}

	function hitobj_x_to_track_number(hitobj_x) {
		return Math.floor(hitobj_x * options.keycount / 512);
	}

	function msToTime(s) {
		var ms = s % 1000;
		s = (s - ms) / 1000;
		var secs = s % 60;
		s = (s - secs) / 60;
		var mins = s % 60;
		var hrs = (s - mins) / 60;
		return hrs + ':' + mins + ':' + secs + '.' + ms;
	}

	var _tracks_next_open = {
		0: -1,
		1: -1,
		2: -1,
		3: -1,
		4: -1,
		5: -1,
		6: -1,
		7: -1
	}
	if (options.song === "") {
		if (beatmap.Title !== "" || beatmap.Title !== undefined) {
			options.song = beatmap.Title;
		} 
		if (options.song === undefined) {
			options.song = "songName";
		}
	}
	if (options.bpm === "") {
		options.bpm = Math.round((beatmap.timingPoints[0].beatLength > 0 ? (1 / beatmap.timingPoints[0].beatLength * 1000 * 60) : (1 / beatmap.timingPoints[1].beatLength * 1000 * 60)) * 100) / 100;
	}
	options.bpm = parseFloat(options.bpm);
	if (isNaN(options.bpm)) {
		options.bpm = 0
	}
	if (options.player1 === "") {
		options.player1 = "bf";
	}
	if (options.player2 === "") {
		options.player2 = "dad";
	}
	if (options.speed === ""){
		options.speed = 1;
	}
	options.speed = parseFloat(options.speed);
	if (isNaN(options.speed)) {
		options.speed = 1;
	}

	if (options.keycount === ""){
		options.keycount = 4;
	}
	options.keycount = parseInt(options.keycount);
	if (isNaN(options.keycount)) {
		options.keycount = 4;
	}

	if (options.camSection === ""){
		options.camSection = 2;
	}
	options.camSection = parseInt(options.camSection);
	if (isNaN(options.camSection)) {
		options.camSection = 2;
	}

	options.lanes = options.convert == true ? 1 : 2;
	if (options.bpm == 0)
		return 'Error: No BPM found.';

	var crochet  = ((60 / options.bpm) * 1000);
	var stepcrochet  = crochet  / 4;
	var sectionlength = stepcrochet * 16;
	var currentlength = 0;
	var currentSection = 0;
	var prevCamera = false;

	var prevMult = 1;
	var prevOffset = 0;
	
	var baseBPM = 0;
	console.log(options.bpm)

	var _i_to_removes = {}

	for (var i = 0; i < beatmap.hitObjects.length; i++) {
		var itr = beatmap.hitObjects[i];
		var type = itr.objectName;
		
		var track = hitobj_x_to_track_number(itr.position[0]);
		var start_time = itr.startTime

		if (_tracks_next_open[track] >= start_time) {
			console.error(format("--ERROR: Note overlapping another. At time (%s), track(%d). (Note type(%s) number(%d))",
				msToTime(start_time),
				track,
				type,
				i
			))

			_i_to_removes[i] = true
			continue
		} else {
			_tracks_next_open[track] = start_time
		}

		if (type == "slider") {
			var end_time = start_time + itr.duration
			if (_tracks_next_open[track] >= end_time) {
				console.error(format("--ERROR: Note overlapping another. At time (%s), track(%d). (Note type(%s) number(%d))",
					msToTime(start_time),
					track,
					type,
					i
				))

				_i_to_removes[i] = true
				continue
			} else {
				_tracks_next_open[track] = end_time
			}

		}
	}

	beatmap.hitObjects = beatmap.hitObjects.filter(function(x,i){
		return !(_i_to_removes[i])
	})

	if (options.svs === true) {
		append_to_output(`{"sliderVelocities":[{"multiplier": 1, "startTime": 0},`)
		for (var i = 0; i < beatmap.timingPoints.length; i++) {
			if (beatmap.timingPoints[i].velocity == prevMult) continue;
			prevMult = beatmap.timingPoints[i].velocity;
			prevOffset = beatmap.timingPoints[i].offset;

			if (prevMult != 1)
			{
				append_to_output(`{"multiplier": ${prevMult},"startTime": ${prevOffset}},`)
			}
		}

		baseBPM = (1 / beatmap.timingPoints[0].beatLength * 1000 * 60)

		rtv_lua = rtv_lua.slice(0, -1)
		append_to_output(`],{"bpmChanges":[{"bpm": ${baseBPM}, "startTime": 0},`)
		
		for (var i = 0; i < beatmap.timingPoints.length; i++) {
			let newBPM = (1 / beatmap.timingPoints[i].beatLength * 1000 * 60)
			if (baseBPM != newBPM)
			{
				baseBPM = newBPM;
				append_to_output(`{"bpm": ${baseBPM},"startTime": ${beatmap.timingPoints[i].offset}},`)
			}
		}

		rtv_lua = rtv_lua.slice(0, -1)
		append_to_output(`],"song":{"player2":"${options.player2}","player1":"${options.player1}","speed":${options.speed},"needsVoices":false,"sectionLengths":[],"song":"${options.song}","bpm":${options.bpm},"sections":0,"validScore":true,"notes":[`)
	} else {
		append_to_output(`{"song":{"player2":"${options.player2}","player1":"${options.player1}","speed":${options.speed},"needsVoices":false,"sectionLengths":[],"song":"${options.song}","bpm":${options.bpm},"sections":0,"validScore":true,"notes":[`)
	}

	while (true) {
		var p1 = false;
		var p2 = false;
		
		var notes = [];

		for (var i = 0; i < beatmap.hitObjects.length; i++) {
			if (beatmap.hitObjects[i].startTime >= currentlength) {
				if (beatmap.hitObjects[i].startTime < currentlength + sectionlength) {
					if (hitobj_x_to_track_number(beatmap.hitObjects[i].position[0]) <= (options.keycount / options.lanes) - 1) {
						p2 = true;
					} else {
						p1 = true;
					}
					notes.push(beatmap.hitObjects[i])
				} else {
					break
				}
			}
		}

		var camera = false;
		if (p2 === false && p1 === true) {
			camera = true;
		} else if (p2 === true && p1 === false) {
			camera = false;
		} else if (p2 === true && p1 === true) {
			camera = true;
		} else if (p2 === false && p1 === false) {
			camera = true;
		}

		if (options.onlyp1 === true)
			camera = false;
		
		if (options.altCamera && options.convert) {
			if ((currentSection + 1) % options.camSection == 0) {
				prevCamera = !prevCamera
			}

			console.log((currentSection + 1) % options.camSection)
			camera = prevCamera;
		}

		append_to_output(`{"mustHitSection":${camera},"typeOfSection":0,"lengthInSteps":16,"sectionNotes":[`)

		for (var i = 0; i < notes.length; i++) {
			append_to_output(`[${notes[i].startTime},`)

			var track = hitobj_x_to_track_number(notes[i].position[0]);

			if (options.altCamera && options.convert)
			{
				if (camera === false) {
					append_to_output(track)
				} else {
					append_to_output(track + (options.keycount / options.lanes))
				}
			} else {
				if (camera === false) {
					append_to_output(track)
				} else if (camera === true && p1 === true && p2 === false) {
					append_to_output(track - (options.keycount / options.lanes))
				} else if (camera === true && p1 === true && p2 === true) {
					if (track > (options.keycount / options.lanes) - 1) {
						append_to_output(track - (options.keycount / options.lanes))
					} else if (track < (options.keycount / options.lanes)) {
						append_to_output(track + (options.keycount / options.lanes))
					}
	
				} else if (camera === true && p2 === false && p1 === false) {
					if (track > (options.keycount / options.lanes) - 1) {
						append_to_output(track - (options.keycount / options.lanes))
					} else if (track < (options.keycount / options.lanes)) {
						append_to_output(track + (options.keycount / options.lanes))
					}
				}
			}

			if (notes[i].duration === undefined) {
				append_to_output(`,0]`)
			} else {
				append_to_output(`,${notes[i].duration}]`)
			}

			if (options.twoplayers === true){
				if (notes[i].soundTypes.includes("whistle") || notes[i].soundTypes.includes("clap")) {
					rtv_lua = rtv_lua.slice(0, -1)
					
					if (notes[i].soundTypes.includes("whistle")) {
						append_to_output(`,"Alt Animation"]`)
					} else if (notes[i].soundTypes.includes("clap")) {
						append_to_output(`,"GF Sing"]`)
					}
				}
			}

			if (options.convert) {
				append_to_output(`,[${notes[i].startTime},`)

				var track = hitobj_x_to_track_number(notes[i].position[0]) + (options.keycount / options.lanes);

				if (options.altCamera && options.convert)
				{
					if (camera === false) {
						append_to_output(track)
					} else {
						append_to_output(track - (options.keycount / options.lanes))
					}
				} else {
					if (camera === false) {
						append_to_output(track)
					} else if (camera === true && p1 === true && p2 === false) {
						append_to_output(track - (options.keycount / options.lanes))
					} else if (camera === true && p1 === true && p2 === true) {
						if (track > (options.keycount / options.lanes) - 1) {
							append_to_output(track - (options.keycount / options.lanes))
						} else if (track < (options.keycount / options.lanes)) {
							append_to_output(track + (options.keycount / options.lanes))
						}
		
					} else if (camera === true && p2 === false && p1 === false) {
						if (track > (options.keycount / options.lanes) - 1) {
							append_to_output(track - (options.keycount / options.lanes))
						} else if (track < (options.keycount / options.lanes)) {
							append_to_output(track + (options.keycount / options.lanes))
						}
					}
				}

				if (notes[i].duration === undefined) {
					append_to_output(`,0]`)
				} else {
					append_to_output(`,${notes[i].duration}]`)
				}

				if (options.twoplayers === true){
					if (notes[i].soundTypes.includes("whistle") || notes[i].soundTypes.includes("clap")) {
						rtv_lua = rtv_lua.slice(0, -1)
						
						if (notes[i].soundTypes.includes("whistle")) {
							append_to_output(`,"Alt Animation"]`)
						} else if (notes[i].soundTypes.includes("clap")) {
							append_to_output(`,"GF Sing"]`)
						}
					}
				}
			}
			
			if (i !== notes.length - 1) {
				append_to_output(",")
			}
		}

		append_to_output(`]}`)
		currentlength += sectionlength;
		currentSection += 1;

		var breaking = true;
		for (var i = 0; i < beatmap.hitObjects.length; i++) {
			if (beatmap.hitObjects[i].startTime >= currentlength) {
				breaking = false;
				break;
			}
		}
		if (breaking === false) {
			append_to_output(",")
		} else {
			break;
		}
	}

	append_to_output(`]}}`)

	if (options.format === true) {
		var obj = JSON.parse(rtv_lua)
		rtv_lua = JSON.stringify(obj, null, "\t")
	}

	return rtv_lua
})
