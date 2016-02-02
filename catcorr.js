(function (exports) {
    catcorr.version = "0.2.0";

    function get_matching_responses(responses) {
	// this is the intersection of all people matching responses
	// across all selected dimensions
	var result = responses;
	var selected_questions = questions
	    .filter(function (q) {return q.has_selection()});
	selected_questions.forEach(function (q, i) {
	    result = result.filter(function (response) {
		return q.response_matches_selected_choices(response);
	    })
	})
	return result;
    }

    function init_groups(questions, responses) {
	var groups = questions
	    .map(function(question){
		var answers = responses
		    .map(function(r) { return r[question.number]; });
		var counts = multi_count(answers);
		question.choices.forEach(function(choice, index) {   if (typeof counts[index] == "undefined") { counts[index] = 0; } });
		return make_group(counts, question);
	    });

	groups.update = function (responses) {
 	    var matching_responses = get_matching_responses(responses);
		outputMatchingResponses(matching_responses);

	    groups.forEach(function(group){
		var answers = matching_responses
		    .map(function(r){
			return r[group.question.number];});
		var counts = multi_count(answers);
			group.question.choices.forEach(function(choice, index) {   if (typeof counts[index] == "undefined") { counts[index] = 0; } });

			group.all.forEach(function (o, k) {
		    o.value = counts[k] || 0;
		})
	    });
	};
	return groups
    }

	function outputMatchingResponses(matching_responses) {
		var responsePanel = document.getElementById('responsePanel');
		var outputText = '';

		matching_responses.forEach(function (response) {
			var outputArray = {};
			for (var question in response) {

				if (response.hasOwnProperty(question)) {
					outputArray[question] = index2label[question][response[question]];
				}

			}

			var json = JSON.stringify(outputArray);
			outputText +=  json + "&nbsp<a href='viewheaders.php?hash="+crc32(json)+"' target='_blank'>Headers</a><br />";
		});

		responsePanel.innerHTML = outputText;
	}

    function histogram_matching_responses(responses) {
	// A
	// get_histograms function which takes responses and generates a
	// object question.number: its histogram for those
	// responses.
	// question.number : [{key:choice, value: count},...]
	// question.number : [{choice:"Male", count:20},...]

	// to initialize catcorr, we'll call
	// get_histograms(everybody), In particular,
	// get_matching_responses(responses) should just work when no
	// dimensions are selected.
 	var matching_responses = get_matching_responses(responses);
	var groups = questions
	    .map(function(question){
		var answers = matching_responses
		    .map(function(r) { return r[question.number]; });
		var counts = multi_count(answers);
			question.choices.forEach(function(choice, index) {   if (typeof counts[index] == "undefined") { counts[index] = 0; } });

			return make_group(counts, question);
	    });
	return groups;
    }

    function make_group(counts, question){
	var out = {"counts":counts};
	var to_object = function(v,k){return {key:+k,
					      value:v};}
	out.all = _.map(out.counts, to_object);
	out.__all__ = question.__all__;
	out.top = function(){
	    return d3.max(_.values(this.counts));
	    // return the top response
	}
	out.all.value = function(){
	    return d3.sum(out.all, function(o){return o.value});
	}
	out.question = question;
	return out;
    }

    function has_selection(){
	// question needs to bind has_selection method
	// question needs to maintain state of whether or not it has a
	// selection on it
	// question needs to remember which choices have been selected
	return this.selected_choices.length > 0;
    }

    function response_matches_selected_choices(response){
	// question needs response_matches_selected_choices method which
	// looks into that response and sees if it has choices that match
	// this question's selected choices.
	var person_choices = response[this.number];
	var selected = this.selected_choices;
	if (typeof(person_choices) === "number") {
	    return _.contains(selected,
			      person_choices);
	} else {
	    return _.any(person_choices,
			 function (person_choice){
			     return _.contains(selected,
					       person_choice)
			 });
	}
    }

    exports.catcorr = catcorr;
    function catcorr(div_id, data, callback) {
	// callback is called after charts are rendered.


	// #########################
	// debugging --global
	questions = data.questions;
        responses = data.responses;

        // create the label2index lookup for quickly calculating the
        // x-coordinate on survey answers

	// debugging so this is global
        label2index = {};
		index2label = {};

        questions.forEach(function (q) {
	    // add additional functions questions here
	    q.has_selection = has_selection;
	    q.selected_choices = [];
	    q.response_matches_selected_choices = response_matches_selected_choices;
		label2index[q.number] = {};
		index2label[q.number] = {};
		q.choices.forEach(function (choice, j) {
			label2index[q.number][choice] = j;
			index2label[q.number][j] = choice;
		});
        });

        // re-cast non-numeric answers into the corresponding number in
        // label2index so that this whole crossfilter bizness works

	// NOTE: This changes the underlying data passed in. In
	// particular, if some choices are missing from questions,
	// then those values in responses will get erased.
        responses.forEach(function (r) {
            questions.forEach(function (q) {
                var choice = r[q.number];
		if (typeof(choice) === "string"){
		    r[q.number] = label2index[q.number][choice];
		} else if (choice) {
		    //r[q.number] = choice.map(function(c){
			//return label2index[q.number][c];
			r[q.number] = label2index[q.number][choice];
			//});
		}
            });
        });

        // add the questions text
        questions.forEach(function (q) {
            q.div = d3.select(div_id)
                .append("div")
                .attr("id", q.number+"-chart")
                .attr("class", "catcorr chart " + q.type);
            q.div.append("div")
                .attr("class", "title")
                .text(q.number+'. '+q.text);
        });

        // Various formatters.
        var formatNumber = d3.format(",d");

        // Create the crossfilter for the relevant dimensions and groups.
        catcorr.groups = [];

        questions.forEach(function (q, i) {
	    var answers = responses.map(function(r){
		return r[q.number]});
	    var counts = multi_count(answers);
			q.choices.forEach(function(choice, index) {   if (typeof counts[index] == "undefined") { counts[index] = 0; } });
			q.__all__ = _.values(counts);
        });

	// make the groups for the first time
	catcorr.groups = init_groups(questions, responses);
	catcorr.groups.update(responses)


        // record the total number of respondents in each group. this is
        // used later to correctly figure out the proportionPath lines
        // below

        // create a chart for each dimension
        var xscales = [], xscale;
	var yscale = d3.scale.linear().range([100,0]);
	var tooltips = [], tooltip;
        var charts = [], chart;
        var bar_width = 80;
	var bar_gap = 3;
        questions.forEach(function (q, i) {

            // get the labels for this axis
            var labels = {};
            q.choices.forEach(function (choice, c) {
                labels[c] = choice;
            });

	    // initialize the tooltips if d3.tip is included
	    if (d3.tip) {
		tooltip = d3.tip()
		    .attr('class', 'd3-tip')
		    .direction('s')
		    .html(function (d) {return "awesome " + d});
		tooltips.push(tooltip);
	    }

            // create the scale
            var a=0, b=q.choices.length-1;
            xscale = d3.scale.linear()
                .domain([-0.5, b+0.5])
                .rangeRound([0, bar_width*((b-a)+1)])
            xscale.labels = labels;
            xscales.push(xscale);

            // update the yscale to have the maximal possible domain
            // so that heights (and areas) on each of the charts mean
            // the same thing
	    yscale.domain([0, d3.max([
		yscale.domain()[1], catcorr.groups[i].top(1) // [0].value
	    ])])

            // create the chart
            chart = barChart(q)
                .group(catcorr.groups[i])
                .x(xscale);
            charts.push(chart);

        });

        // Given our array of charts, which we assume are in the same
        // order as the .chart elements in the DOM, bind the charts to
        // the DOM and render them.  We also listen to the chart's
        // brush events to update the display.
        var chart = d3.selectAll(".catcorr.chart")
            .data(charts);

        // add an <aside> element that displays fraction of elements
        // currently selected
        var legend = d3.select(div_id)
            .append("aside")
            .attr("id", "legend")
            .attr("class", "catcorr")
            .html("<div style='clear:both;margin-top:20px'></div>"+
		  "<span id='active'>-</span> "+
		  "<span>/</span> <span id='total'>-</span> <br/> selected respondents");
	var legend_width=200, legend_height=120;
	var legend_svg = legend.insert("svg", "div")
            .attr("width", legend_width)
            .attr("height", legend_height)
            .append("g")
            .attr("transform", "translate(0,0)");

	// add a clear div at the bottom as temporary fix for #18
	d3.select(div_id)
	    .append("div")
	    .style("clear", "both");

	// draw the bars on the legend
	legend_svg.selectAll(".bar")
            .data(["all_background", "background", "foreground",
                   "all_proportion"])
            .enter().append("path")
            .attr("class", function(d, i) {
                if (i===0){
                    return "catcorr "+d+" all_bar outcome";
                }
                else if(i===3) {
                    return "catcorr "+d+" all_bar outcome";
                }
                return "catcorr "+d+" bar outcome";
            });
	legend_svg.select(".all_background.all_bar")
	    .attr("d", ["M",
			(legend_width-(bar_width-2*bar_gap))/2,
			",",10,"v",100,"h",bar_width-2*bar_gap,
			"v",-100].join(""));
	legend_svg.select(".foreground.bar")
	    .attr("d", ["M",
			(legend_width-(bar_width-2*bar_gap))/2,
			",",80,"v",30,"h",bar_width-2*bar_gap,
			"v",-30].join(""));
	legend_svg.select(".all_proportion.all_bar")
	    .attr("d", ["M",
			(legend_width-(bar_width-2*bar_gap))/2,
			",",40,"h",bar_width-2*bar_gap,
			"M", legend_width/2,",",15,"v",44].join(""));

	// display all respondents label
	legend_svg.append("foreignObject")
	    .attr("class", "catcorr legend")
	    .attr("width", (legend_width-bar_width)/2)
	    .attr("height", "3em")
	    .attr("x", legend_width/2+bar_width/2+bar_gap)
	    .attr("y", 0)
	    .text("all respondents");
	legend_svg.append("path")
	    .attr("class", "catcorr legend")
	    .attr("d", ["M",legend_width/2+bar_width/2,",",7,
			"h",-15,"l",-7,",",7].join(""));

	// display selected respondents label
	legend_svg.append("foreignObject")
	    .attr("class", "catcorr legend")
	    .attr("width", (legend_width-bar_width)/2)
	    .attr("height", "3em")
	    .attr("x", legend_width/2+bar_width/2+bar_gap)
	    .attr("y", 106)
	    .text("selected respondents");
	legend_svg.append("path")
	    .attr("class", "catcorr legend")
	    .attr("d", ["M",legend_width/2+bar_width/2,",",113,
			"h",-15,"l",-7,",",-7].join(""));

	// display expected selected respondents label
	legend_svg.append("foreignObject")
	    .attr("class", "catcorr legend")
	    .attr("width", (legend_width-bar_width)/2)
	    .attr("height", "5em")
	    .attr("x", legend_width/2+bar_width/2+bar_gap)
	    .attr("y", 35)
	    .text("expected number of selected respondents");
	legend_svg.append("path")
	    .attr("class", "catcorr legend")
	    .attr("d", ["M",legend_width/2+bar_width/2,",",47,
			"h",-15,"l",-7,",",-7].join(""));

	// display variation in expected selected respondents label
	legend_svg.append("foreignObject")
	    .attr("class", "catcorr legend right")
	    .attr("width", (legend_width-bar_width)/2-20)
	    .attr("height", "5em")
	    .attr("x", 0)
	    .attr("y", 12)
	    .attr("text-align", "right")
	    .text("variation in expected number of selected respondents");
	legend_svg.append("path")
	    .attr("class", "catcorr legend")
	    .attr("d", ["M",legend_width/2-bar_width/2-18,",",36,
			"h",15,"v",22,"h",42,
			"M",legend_width/2-bar_width/2-3,",",36,
			"v",-22,"h",42].join(""));

	// if there are more than one type of question, render a
	// legend for the colors
	var question_types = d3.set();
	questions.forEach(function (q) {
	    question_types.add(q.type);
	});
	question_types = question_types.values();
	if (question_types.length>1) {
	    var swatch_w = 20, swatch_gap=5;
	    legend.insert("div", "svg")
		.style("clear", "both")
	    var color_legend_svg = legend.insert("svg", "div")
		.attr("width", legend_width)
		.attr("height",
		      question_types.length*(swatch_w+swatch_gap)+swatch_gap)
		.style("margin-bottom", 20)
		.append("g")
		.attr("transform", "translate(0,0)");

	    color_legend_svg.selectAll()
		.data(question_types).enter()
		.append("path")
		.attr("class", function (d) {
		    return "catcorr foreground bar "+d
		})
		.attr("d", function (d, i) {
		    return ["M", swatch_w/2, ",",
			    swatch_gap+i*(swatch_w+swatch_gap),
			    "h", swatch_w, "v", swatch_w, "h", -swatch_w]
			.join("")
		});

	    color_legend_svg.selectAll()
		.data(question_types).enter()
		.append("text")
		.attr("class", "catcorr legend")
		.attr("x", swatch_w*2 + bar_gap)
		.attr("y", function (d, i) { 
		    return swatch_gap + i*(swatch_w+swatch_gap) + swatch_w/2
		})
		.attr("dy", "0.35em")
		.text(function (d) { return d});
	}

        // Render the total.
        d3.selectAll("aside.catcorr #total")
            .text(formatNumber(responses.length));

        renderAll();

	if (callback){
	    callback();
	}


        // Renders the specified chart or list.
        function render(method) {
            d3.select(this).call(method);
        }

        // Whenever the brush moves, re-rendering everything.
        function renderAll() {
            chart.each(render);
            d3.select("aside.catcorr #active")
		.text(formatNumber(catcorr.groups[0].all.value()));
        }

        window.filter = function(filters) {
            filters.forEach(function(d, i) { charts[i].filter(d); });
            renderAll();
        };

        function barChart(question) {
            if (!barChart.id) barChart.id = 0;

            var margin = {top: 10, right: 10, bottom: 20, left: 10},
            x,
            y = yscale,
	    tooltip = tooltips[barChart.id],
            id = barChart.id++,
            axis = d3.svg.axis().orient("bottom").tickSize(6,0,0),
            group,
            round;

            function chart(div) {
                var width = d3.max(x.range()),
                height = d3.max(y.range());

                // create ticks at these particular values
                axis.tickValues(d3.range(0,d3.keys(x.labels).length));

                div.each(function() {
                    var div = d3.select(this),
                    g = div.select("g");

                    // Create the skeletal chart.
                    if (g.empty()) {
                        div.select(".title").append("a")
                            .attr("class", "catcorr reset")
                            .text("reset")
                            .style("display", "none")
			    .on("click", function () {
				d3.select(this).style("display", "none");
				d3.select(this.parentNode.parentNode)
				    .selectAll(".catcorr.selected")
				    .classed("not", true);
				questions[id].selected_choices = [];
				catcorr.groups.update(responses)
				renderAll();

			    });

                        g = div.append("svg")
                            .attr("width", width + margin.left + margin.right)
                            .attr("height", height + margin.top + margin.bottom)
                            .append("g")
                            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

			// create a hatching pattern for displaying
			// the selected choices
			// http://stackoverflow.com/a/14500054/564709
			var pattern = div.select("svg")
			    .insert("pattern", "g")
			    .attr("id", "diagonalHatch")
			    .attr("patternUnits", "userSpaceOnUse")
			    .attr("width", 10)
			    .attr("height", 10);
			pattern.append("path")
			    .attr("class", "catcorr hatching")
			    .attr("d", "M-1,1l2,-2M0,10l10,-10M9,11l2,-2");

			// invoke tooltip for this visualization
			if (tooltip) {
			    g.call(tooltip);
			}

                        g.append("clipPath")
                            .attr("id", "clip-" + id)
                            .append("rect")
                            .attr("width", width)
                            .attr("height", height);

                        g.selectAll(".bar")
                            .data(["all_background", "background", "foreground",
                                   "all_proportion"])
                            .enter().append("path")
                            .attr("class", function(d, i) {
                                if (i===0){
                                    return "catcorr "+d+" all_bar "+question.type;
                                }
                                else if(i===3) {
                                    return "catcorr "+d+" all_bar "+question.type;
                                }
                                return "catcorr "+d+" bar "+question.type;
                            })
                            .datum(catcorr.groups[id].all);

                        g.selectAll(".foreground.bar")
                            .attr("clip-path", "url(#clip-" + id + ")");

                        g.append("g")
                            .attr("class", "catcorr axis")
                            .attr("transform", "translate(0," + height + ")")
                            .call(axis);

                        // manipulate the axis label text
                        var labels = g.selectAll("g.axis text")
                            .text(function (d) {
				var n = 20;
				var s = x.labels[d];
				if (s===undefined) {
				    return '';
				}
				else if (s.length > n) {
				    var parts = s.substring(0,n-3).split(" ");
				    s = parts.slice(0,parts.length-1).join(" ");
				    s += "...";
				}
				return s;
			    });
			if (tooltip) {
			    tooltip.html(function (d) {
				return x.labels[d];
			    });
			    labels.on("mouseover", tooltip.show)
				.on("mouseout", tooltip.hide);
			}

			// initialize the selected regions to make
			// things clickable
			gSelected = g.selectAll(".catcorr.selected")
			    .data(catcorr.groups[id].all)
			    .enter()
			    .append("rect")
			    .attr("class", "catcorr not selected")
			    .attr("fill", "url(#diagonalHatch)")
			    .attr("x", function (d) {return x(d.key) - (0.5*bar_width - bar_gap)})
			    .attr("width", bar_width-2*bar_gap)
			    .attr("y", y.range()[1])
			    .attr("height", y.range()[0])
			    .on("click", update_selection);
                    }

                    // this is what actually uses the group data to set
                    // the path. good.
                    g.selectAll(".bar").attr("d", barPath);

                    // only render the .all_bar data once at the beginning
                    g.selectAll(".all_background.all_bar")
                        .attr("d", function (groups, i) {
                            var v = d3.select(this).attr("d");
                            if (v===null) {
                                return barPath(groups, i);
                            }
                            return v;
                        });

                    // render the .all_proportion.all_bar to show the
                    // proportion of selected responses that fall in
                    // this group
		    if (questions[id].selected_choices.length === 0) {
			g.selectAll(".all_proportion.all_bar")
                            .attr("d", proportionPath);
		    }

		    // make sure the asterisk's don't exist on
		    // dimensions that are selected
		    else {
			g.selectAll(".asterisk").remove();
			g.selectAll(".fa").remove();
		    }
                });

		function update_selection(d) {
		    // enforce the toggling behavior to keep
		    // track of which choices have been
		    // selected at the data level
		    var selected_index = questions[id].selected_choices.indexOf(d.key);
		    if (selected_index > -1) {
			questions[id].selected_choices.splice(selected_index, 1);
			d3.select(this).classed("not", true);
		    }
		    else {
			questions[id].selected_choices.push(d.key);
			d3.select(this).classed("not", false);

		    }
		    if (questions[id].selected_choices.length === 0) {
			d3.select(this.parentNode.parentNode.parentNode)
			    .select(".title a").style("display", "none");
		    }
		    else {
			d3.select(this.parentNode.parentNode.parentNode)
			    .select(".title a").style("display", null);
		    }

		    catcorr.groups.update(responses)
		    renderAll();

		}

                function barPath(groups) {
                    var path = [],
                    i = -1,
                    n = groups.length,
                    d;
                    while (++i < n) {
                        d = groups[i];
                        path.push("M", x(d.key-0.5)+bar_gap, ",",
                                  height, "V", y(d.value), "h",bar_width-2*bar_gap,
                                  "V", height);
                    }
                    return path.join("");
                }

		function calc_confidence_intervals(n_selected) {
		    // this is the number of total number of people
		    var N = responses.length;
		    var k = get_k(responses, group)

		    // create an array of the probabilities for each
		    // group. alpha is the hyperparameter of the
		    // categorical distribution
		    // http://en.wikipedia.org/wiki/Categorical_distribution
		    var p = group.__all__.map(function (x) {
			return calc_p(x, N, k);
		    });
		    var confidence_intervals, bound;
		    var get_bound = function(pp){
			return 1.96*Math.sqrt((pp*(1-pp))/n_selected);
		    }

		    confidence_intervals = p.map(function(pp,i){
			// TODO Think carefully about whether this
			// should be N or n here
			return [
			    n_selected * Math.max(pp - get_bound(pp), 0),
			    n_selected * Math.min(pp + get_bound(pp), 1)
			];})


		    // debugging probabilities...
		    var pizza = catcorr.debug[group.question.number];
		    if (!pizza){
		    	catcorr.debug[group.question.number] = {};
		    	pizza = catcorr.debug[group.question.number];
		    }
		    pizza["conf"] = {"N":N, "k":k, "p":p,
		    		     "confidence":confidence_intervals};

		    return confidence_intervals;
		}

		function backer_box(xc) {
		    return "M"+(xc-bar_width/2)+","+(-margin.top)+
			"h"+bar_width+
			"v"+(margin.top+y.range()+margin.bottom)+
			"h"+(-bar_width)+
			"Z";
		}

                function proportionPath(answers) {
		    // remove all significance from before
		    var svg = d3.select(this.parentNode);
		    svg.selectAll(".asterisk").remove();
		    svg.selectAll(".fa").remove();

                    var path = [],
                    i = -1,
                    n_answers = answers.length,
                    answer, prob, expected, lwr, upr,
                    n_selected = catcorr.groups[0].all.value(),
		    n_responses = responses.length,
		    n_choices = group.__all__.length,
		    confidence_intervals;

		    if (n_selected!=responses.length) {
			var confidence_intervals = calc_confidence_intervals(n_selected)
		    }

                    while (++i < n_answers) {
                        answer = answers[i];
			n_choices = get_k(responses, group);
                        prob = calc_p(group.__all__[i], n_responses,
				      n_choices);
			expected = n_selected*prob;
			save_stuff(group, expected, confidence_intervals,
				   n_selected, prob, answers, i);

                        path.push("M", x(answer.key-0.5)+bar_gap, ",",
				  y(expected),
				  "h", bar_width-2*bar_gap);

						svg.append("text")
							.attr("font-size","12px")
							.attr("x",x(answer.key)-margin.left)
							.attr("y",margin.top+5)
							.attr("class", "fa")
							.text(answer.value);

			if (confidence_intervals) {
			    lwr = confidence_intervals[i][0];
			    upr = confidence_intervals[i][1];
			    path.push("M", x(answer.key), ",", y(lwr),
				      "v", y(upr)-y(lwr));

			    // draw an asterisk above this bar
			    if (answer.value < lwr || upr < answer.value) {
				// font-awesome arrow-up: "\f062"
				// arrow-down: "\f063"
				// trick from http://stackoverflow.com/questions/14984007/how-do-i-include-a-font-awesome-icon-in-my-svg

				var hi_lo = "/\\";//"\uf062" // high
				if (answer.value < lwr) {
				    hi_lo = "\\/"; //"\uf063" // lo;
				}
				svg.insert("path", "path.catcorr.all_bar")
				    .attr("class", "catcorr asterisk")
				    .attr("d", backer_box(x(answer.key)));
				svg.append("text")
				    .attr("font-size","15px")
				    .attr("x",x(answer.key)-margin.left)
				    .attr("y",margin.top+25)
				    .attr("class", "fa")
				    .text(hi_lo);
			    }
			}
                    }
                    return path.join("");
                }

                function resizePath(d) {
                    var e = +(d == "e"),
                    x = e ? 1 : -1,
                    y = height / 3;
                    return "M" + (.5 * x) + "," + y
                        + "A6,6 0 0 " + e + " " + (6.5 * x) + "," + (y + 6)
                        + "V" + (2 * y - 6)
                        + "A6,6 0 0 " + e + " " + (.5 * x) + "," + (2 * y)
                        + "Z"
                        + "M" + (2.5 * x) + "," + (y + 8)
                        + "V" + (2 * y - 8)
                        + "M" + (4.5 * x) + "," + (y + 8)
                        + "V" + (2 * y - 8);
                }
            }


            // jasondavies fanciness. binding methods to this function
            chart.margin = function(_) {
                if (!arguments.length) return margin;
                margin = _;
                return chart;
            };
            chart.x = function(_) {
                if (!arguments.length) return x;
                x = _;
                axis.scale(x);
                return chart;
            };
            chart.y = function(_) {
                if (!arguments.length) return y;
                y = _;
                return chart;
            };
            chart.group = function(_) {
                if (!arguments.length) return group;
                group = _;
                return chart;
            };
            chart.round = function(_) {
                if (!arguments.length) return round;
                round = _;
                return chart;
            };
	    return chart;
        }
    };
})(this)

function extent_to_range(extent){
    // takes something like [-.5, 2.5] --> [0,1,2]
    var a = extent[0] + .5 , b = extent[1];
    return _.range(a, b)
}

function ravel(iterables){
    var out = [];
    iterables.forEach(
	function(iterable){
	    iterable.forEach(
		function(thing){ out.push(thing) })});
    return out;
}

function multi_count(answers){
    // counts all the singletons in a list of lists or in a list
    if (typeof(answers[0]) === "object"){
	// answers is a list of lists so ravel it into a long list of singletons
	answers = ravel(answers);
    }
    // count singletons
    return _.countBy(answers);
}

function get_k(responses,group){
    var k = group.__all__.length;
    if (typeof(responses[0][group.question.number])==="object"){
    	k = 2;
    }
    return k;
}

// previous versions simulated a random process 250
// times to estimate the 95% confidence
// intervals. This was all well and good, but the
// simulations were not exact and caused the interface
// to flicker (which is pretty confusing for
// users). This approach uses an approximation to
// estimate the 95% confidence interval, but because
// it is an exact solution it avoids the flickering
// problem
// http://stats.stackexchange.com/a/19142/31771
function calc_p(n_people_who_chose_this,
		n_total_responses,
		n_choices) {
    // in multichoice case, n_total_responses is
    // really the number of total checked boxes. We
    // probably care more about number of people who
    // chose this vs people who didnt -- which in the
    // multichoice case is != n_total_responses.

    var pseudocount = 1;
    return ((n_people_who_chose_this + pseudocount) /
	    (n_total_responses + pseudocount*n_choices));
}

catcorr.debug = {}
function save_stuff(group, expected, confidence_intervals, N, p, answers, i){
    var number = group.question.number;
    if (confidence_intervals){
	var c = confidence_intervals[i];
	catcorr.debug[number][i] = [expected, c, N, p, group, answers, i];
    }
}

function assert(){
    // select "male"
    var germany = catcorr.debug.S2[0];
    var expected = germany[0]
    var bounds = germany[1]
    console.assert(Math.abs((bounds[0] - 62.78)) < .01)
    console.assert(Math.abs((bounds[1] - 92.71)) < .01)
    console.assert(Math.abs(expected - 77.75)<.01)
}

var a_table = "00000000 77073096 EE0E612C 990951BA 076DC419 706AF48F E963A535 9E6495A3 0EDB8832 79DCB8A4 E0D5E91E 97D2D988 09B64C2B 7EB17CBD E7B82D07 90BF1D91 1DB71064 6AB020F2 F3B97148 84BE41DE 1ADAD47D 6DDDE4EB F4D4B551 83D385C7 136C9856 646BA8C0 FD62F97A 8A65C9EC 14015C4F 63066CD9 FA0F3D63 8D080DF5 3B6E20C8 4C69105E D56041E4 A2677172 3C03E4D1 4B04D447 D20D85FD A50AB56B 35B5A8FA 42B2986C DBBBC9D6 ACBCF940 32D86CE3 45DF5C75 DCD60DCF ABD13D59 26D930AC 51DE003A C8D75180 BFD06116 21B4F4B5 56B3C423 CFBA9599 B8BDA50F 2802B89E 5F058808 C60CD9B2 B10BE924 2F6F7C87 58684C11 C1611DAB B6662D3D 76DC4190 01DB7106 98D220BC EFD5102A 71B18589 06B6B51F 9FBFE4A5 E8B8D433 7807C9A2 0F00F934 9609A88E E10E9818 7F6A0DBB 086D3D2D 91646C97 E6635C01 6B6B51F4 1C6C6162 856530D8 F262004E 6C0695ED 1B01A57B 8208F4C1 F50FC457 65B0D9C6 12B7E950 8BBEB8EA FCB9887C 62DD1DDF 15DA2D49 8CD37CF3 FBD44C65 4DB26158 3AB551CE A3BC0074 D4BB30E2 4ADFA541 3DD895D7 A4D1C46D D3D6F4FB 4369E96A 346ED9FC AD678846 DA60B8D0 44042D73 33031DE5 AA0A4C5F DD0D7CC9 5005713C 270241AA BE0B1010 C90C2086 5768B525 206F85B3 B966D409 CE61E49F 5EDEF90E 29D9C998 B0D09822 C7D7A8B4 59B33D17 2EB40D81 B7BD5C3B C0BA6CAD EDB88320 9ABFB3B6 03B6E20C 74B1D29A EAD54739 9DD277AF 04DB2615 73DC1683 E3630B12 94643B84 0D6D6A3E 7A6A5AA8 E40ECF0B 9309FF9D 0A00AE27 7D079EB1 F00F9344 8708A3D2 1E01F268 6906C2FE F762575D 806567CB 196C3671 6E6B06E7 FED41B76 89D32BE0 10DA7A5A 67DD4ACC F9B9DF6F 8EBEEFF9 17B7BE43 60B08ED5 D6D6A3E8 A1D1937E 38D8C2C4 4FDFF252 D1BB67F1 A6BC5767 3FB506DD 48B2364B D80D2BDA AF0A1B4C 36034AF6 41047A60 DF60EFC3 A867DF55 316E8EEF 4669BE79 CB61B38C BC66831A 256FD2A0 5268E236 CC0C7795 BB0B4703 220216B9 5505262F C5BA3BBE B2BD0B28 2BB45A92 5CB36A04 C2D7FFA7 B5D0CF31 2CD99E8B 5BDEAE1D 9B64C2B0 EC63F226 756AA39C 026D930A 9C0906A9 EB0E363F 72076785 05005713 95BF4A82 E2B87A14 7BB12BAE 0CB61B38 92D28E9B E5D5BE0D 7CDCEFB7 0BDBDF21 86D3D2D4 F1D4E242 68DDB3F8 1FDA836E 81BE16CD F6B9265B 6FB077E1 18B74777 88085AE6 FF0F6A70 66063BCA 11010B5C 8F659EFF F862AE69 616BFFD3 166CCF45 A00AE278 D70DD2EE 4E048354 3903B3C2 A7672661 D06016F7 4969474D 3E6E77DB AED16A4A D9D65ADC 40DF0B66 37D83BF0 A9BCAE53 DEBB9EC5 47B2CF7F 30B5FFE9 BDBDF21C CABAC28A 53B39330 24B4A3A6 BAD03605 CDD70693 54DE5729 23D967BF B3667A2E C4614AB8 5D681B02 2A6F2B94 B40BBE37 C30C8EA1 5A05DF1B 2D02EF8D";
var b_table = a_table.split(' ').map(function(s){ return parseInt(s,16) });
function crc32 (str) {
	var crc = crc ^ (-1);
	for(var i=0, iTop=str.length; i<iTop; i++) {
		crc = ( crc >>> 8 ) ^ b_table[( crc ^ str.charCodeAt( i ) ) & 0xFF];
	}
	return (crc ^ (-1)) >>> 0;
};