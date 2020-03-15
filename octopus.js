
module.exports = function(RED) {
    "use strict";
    //The Server Definition - this opens (and closes) the connection
    
    function octopusServerNode(n) {
        RED.nodes.createNode(this,n);
        this.server = n.server;
        this.name = n.name;
    }
    RED.nodes.registerType("octopus-server",octopusServerNode,{
        credentials: {
            apikey: {type:"text"}
        }
    });

    function octopusin(n) {
        RED.nodes.createNode(this,n);
        // this.emonServer = n.emonServer;
        // var sc = RED.nodes.getNode(this.emonServer);

        this.region = n.region
        var node = this;

        var baseurl = "https://api.octopus.energy/v1/products/AGILE-18-02-21/electricity-tariffs/E-1R-AGILE-18-02-21-";
        var https = require("https");
        var next_run = new Date(0);

        this.on("input", function(msg) {
            var now = new Date(); 
            var next_half_hour_ts = Math.trunc(Math.floor(((now.getTime()/1000)+(30*60))/1800))*1800*1000;
            var next_half_hour = new Date(next_half_hour_ts);

            if ( next_run <= now ) {
                var start_time = now.toISOString();
                var endt = new Date(now.getTime() + 24*60*60*1000);
                var end_time = endt.toISOString();
                
                
                // add start and end used to msg - strip milliseconds
                msg.start_time = start_time.replace(/\.[0-9]{3}/, '');
                msg.end_time = end_time.replace(/\.[0-9]{3}/, '');
                msg.region = this.region;
    
                let APIurl = baseurl + this.region + '/standard-unit-rates/?' + 'period_from=' + start_time + '&' + 'period_to=' + end_time;
    
                https.get(APIurl, function(res) {
                    msg.rc = res.statusCode;
                    msg.version = 2
                    msg.payload = "";
                    res.setEncoding('utf8');
                    res.on('data', function(chunk) {
                        msg.payload += chunk;
                    });
                    res.on('end', function() {
                        if (msg.rc === 200) {
                            try {
                                msg.payload = JSON.parse(msg.payload);
                                msg.price_array = msg.payload.results.map(a => a.value_inc_vat);
                                msg.current_price = msg.payload.results[msg.payload.results.length - 1].value_inc_vat;
                                msg.next_price = msg.payload.results[msg.payload.results.length - 2].value_inc_vat;

                                var blocks = 3;
                                let result = [];
                                for (let n = 0; n < msg.price_array.length - blocks + 1; n++) {
                                    let sum = 0;
                                    for (let i = n; i < n + blocks; i++) {
                                        sum+= msg.price_array[i];
                                    }
                                    result.push(sum / blocks);
                                }

                                // console.log(array.indexOf(Math.min(...msg.price_array)));
                                msg.min_price_inc_vat = console.log(Math.min(...msg.price_array));

                                next_run = next_half_hour;
                            }
                            catch(err) {
                                // Failed to parse, pass it on
                            }
                            // set time for next request on success
                            node.send(msg);
                        }
                    });
                }).on('error', function(e) {
                    node.error(e,msg);
                });
            }

        });
    }
    


    function DarkSkyInputNode(n) {
        RED.nodes.createNode(this, n);
        this.lang = n.lang || "en";
        this.units = n.units || "us";
        var node = this;
        this.repeat = 900000;
        this.interval_id = null;
        var previousdata = null;

        this.interval_id = setInterval( function() {
            node.emit("input",{});
        }, this.repeat );

        this.on('input', function(msg) {
            assignmentFunction(node, n.date, n.time, n.lat, n.lon, RED.nodes.getNode(n.darksky), function(err) {
                if (err) {
                    node.error(err,msg);
                } else {
                    weatherPoll(node, msg, function(err) {
                        if (err) {
                            node.error(err,msg);
                        } else {
                            var msgString = JSON.stringify(msg.payload);
                            if (msgString !== previousdata) {
                                previousdata = msgString;
                                node.send(msg);
                            }
                        }
                    });
                }
            });
        });

        this.on("close", function() {
            if (this.interval_id !== null) {
                clearInterval(this.interval_id);
            }
        });

        node.emit("input",{});
    }



    RED.nodes.registerType("octopus in",octopusin);
}
