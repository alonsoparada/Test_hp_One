/*jsl:option explicit*/

function organizeOrder(recType, recId){
	//actual flow at bottom of this function

var SALE_TYPE_HTO = '1';
var SALE_TYPE_STD = '2';
var SALE_TYPE_COMBO = '4';
var SALE_TYPE_GIFT = '6';
var SALE_TYPE_SUNGLASSES = '7';
var SALE_TYPE_RX_SUNGLASSES = '9';
var SALE_TYPE_CROSSOVER_NON_RX = '13';
var SALE_TYPE_REPLACE_LENS = '10';
var SALE_TYPE_GIFT_BOX = '11';
var SALE_TYPE_UNKNOWN = '8';
//var SALE_TYPE_RETAIL = '12';

var defaultLocations = (function(){
	var x = nlapiSearchRecord('location', null,
	[ new nlobjSearchFilter('makeinventoryavailable', null, 'is', 'T')], [
	new nlobjSearchColumn('custrecord_default_location_for_type'),
	new nlobjSearchColumn('name')]);

	var types = [];
	x.forEach(function(loc){
		var typeVals = loc.getValue('custrecord_default_location_for_type');
		if(typeVals){
			typeVals.split(",").forEach(function(val){ types[val] = loc.getId();});
		}
	});
	return types;
})();

function isMagento(rec){ return ('T' == rec.getFieldValue('custbody_celigo_magento'));}

function inArray(arr, val){ //uses implicit equals so that ns ids compare whether integers or strings
	if(!arr) return -1;
	for(var i = 0; i< arr.length; i++) {if(arr[i] == val) return i;}
	return -1;
}

function copyOrder(srcRec, orderType, keepLines, beforeSubmit){
	nlapiLogExecution("DEBUG", "copying "+ srcRec.getId(), "type: "+ orderType + " keeping lines: "+ (keepLines ? keepLines.join(", ") : ' none ') + (beforeSubmit ? " has before submit " : " no extra fcn"));
	var soRec = null;
	try{
		soRec = nlapiCopyRecord(srcRec.getRecordType(), srcRec.getId()); //,{recordmode:'dynamic'}
		var locn = defaultLocations[orderType];
		soRec.setFieldValue('custbody_sale_type', orderType);
		soRec.setFieldValue('custbody_original_order', srcRec.getId());
		soRec.setFieldValue('location', locn);
		for(var i = soRec.getLineItemCount('item'); i> 0; i--){
			if(inArray(keepLines, i) == -1) soRec.removeLineItem('item', i);
			else soRec.setLineItemValue('item', 'location', i, locn);
		}
		if(beforeSubmit) beforeSubmit(soRec);
		adjustShippingMethod(soRec);
		var copiedId = nlapiSubmitRecord(soRec, true, true);
		return copiedId;
	}catch(e){
		var targetTran = soRec.getFieldValue('tranid') || soRec.getFieldText('custbody_original_order') || ' - new order - ';
		nlapiLogExecution('ERROR', "Copying order: "+ targetTran, (e.message || e.toString()) +(e.getStackTrace ? "\n\n"+ e.getStackTrace().join("\n") : ''));
		var targetId = soRec.getId() || soRec.getFieldValue('custbody_original_order');
		if(targetId){
			try{
				var n = nlapiCreateRecord('note');
				n.setFieldValue('transaction', targetId);
				n.setFieldValue('entity', soRec.getFieldValue('entity'));
				n.setFieldValue('title', "Error copying order:"+ targetTran);
				n.setFieldValue('note', "Error copying order SO:"+ targetTran +"\n\n"+ e.message);
				nlapiSubmitRecord(n);
			}catch(e){nlapiLogExecution('ERROR', 'setting no message note', e.message);}
		}
		return null;
	}
}

function setOrderType(soRec, orderType, removeLines, beforeSubmit){
	soRec.setFieldValue('custbody_sale_type', orderType);
	var locn = defaultLocations[orderType];
	if(locn) soRec.setFieldValue('location', locn);
	for(var i = soRec.getLineItemCount('item'); i> 0; i--){
		if(removeLines && inArray(removeLines, i) != -1){
			soRec.removeLineItem('item', i);
			continue;
		}
		if(locn) soRec.setLineItemValue('item', 'location', i, locn);
	}
	if(beforeSubmit) beforeSubmit(soRec);
}

function htoSetup(rec){
	if(!isMagento(rec)){
		nlapiLogExecution("DEBUG", "processing non-magento order with payment type: "+ rec.getFieldValue('paymentmethod'));
		var line = rec.getLineItemCount('item')+1;
		rec.insertLineItem('item', line);
		rec.setLineItemValue('item', 'item', line, 668); // HTO Auth item
		rec.setLineItemValue('item', 'quantity', line,1);
		rec.setLineItemValue('item', 'rate', line,1);
		rec.setLineItemValue('item', 'amount', line, 1.00);
		rec.setLineItemValue('item', 'location', line, rec.getFieldValue('location'));

//		if(PMT_METHOD_VISA == rec.getFieldValue('paymentmethod')){ // Visa approval is complete
//			var verifyResult = verifyEMerchantESolutions(
//					rec.getFieldValue('ccnumber'),
//					rec.getFieldValue('ccexpiredate'),
//					0.0,
//					rec.getFieldValue('ccstreet'),
//					rec.getFieldValue('cczipcode'),
//					PMT_METHOD_VISA);
//			if(!verifyResult.isApproved) throw nlapiCreateError('HTO_EMERCHANT_VERIFY', "Card Failed E-Merchant Solutions pre-verification");
//			rec.setFieldValue('ccapproved', 'T');
//			rec.setFieldText('ccavsstreetmatch', verifyResult.streetMatch);
//			rec.setFieldText('ccavszipmatch', verifyResult.zipMatch);
//			rec.setFieldValue('authcode', verifyResult.auth_code); //will only be an address verification code
//			rec.setFieldValue('pnrefnum', 'n/a');
//		}else{
			//rec.setFieldValue('orderstatus', 'B'); // set approved will only go through if authorization works
			rec.setFieldValue('getauth', 'T');
//		}
	}

}

function giftCardSetup(rec){
	; // null
}


function opticalSGSetup(rec){
	// make sure appropriate lens lines are in this order

	function lineVal(fld, line){return rec.getLineItemValue('item', fld, line);}
	var lensSpecs = [];

	(function(){
		function LensSpec(line, itemId, lensId, needQty, haveQty){
			this.line = line;
			this.itemId = itemId;
			this.lensId = lensId;
			this.needQty = needQty;
			this.haveQty = haveQty;
		}
		for(var i = rec.getLineItemCount('item'); i> 0; i--){
			lensSpecs.push(new LensSpec(i, lineVal('item', i), lineVal('custcol_lens_reference', i), (lineVal('custcol_lens_reference', i) ? parseInt(lineVal('quantity', i),10) : 0), 0));
		}
	})();

	var itemIds = lensSpecs.filter(function(ls){ return !ls.lensId;}).map(function(ls){ return ls.itemId;});
	if(itemIds.length){
		var lensRefs = nlapiSearchRecord('item', null,
			[
				new nlobjSearchFilter('internalid', null, 'anyof', itemIds),
				new nlobjSearchFilter('custitem_default_lens', null, 'noneof', ['@NONE@'])
			], new nlobjSearchColumn('custitem_default_lens'));
		if(lensRefs){
			lensRefs.forEach(function(lr){
				for(var i = 0; i< lensSpecs.length; i++){
					var spec = lensSpecs[i];
					if(spec.itemId == lr.getId() && !spec.lensId){
						spec.lensId = lr.getValue('custitem_default_lens');
						spec.needQty = parseInt(lineVal('quantity', spec.line), 10);
					}
				}
			});
		}
	}

	lensSpecs = lensSpecs.filter(function(ls){ return ls.needQty && ls.lensId;}); // just the rows that need a lens line added
	if(!lensSpecs.length) return;

	lensSpecs.forEach(function(ls){
		if(!lineVal('custcol_lens_reference', ls.line)) rec.setLineItemValue('item', 'custcol_lens_reference', ls.line, ls.lensId);
	});

	var lensLineCounts = [];
	lensSpecs.forEach(function(ls){
		var llc = lensLineCounts[ls.lensId] || {need:0, have:0};
		llc.need += ls.needQty;
		lensLineCounts[ls.lensId] = llc;
	});

	for(var i = rec.getLineItemCount('item'); i> 0; i--){
		var llc = lensLineCounts[lineVal('item', i)];
		if(llc) llc.have += parseInt(lineVal('quantity', i), 10) || 0;
	}
	for(var lensId in lensLineCounts){
		var spec = lensLineCounts[lensId];
		if(spec.need > spec.have){
			var lensPos = rec.getLineItemCount('item') + 1;
			rec.insertLineItem('item', lensPos);
			rec.setLineItemValue('item', 'item', lensPos, lensId);
			rec.setLineItemValue('item', 'quantity', lensPos, spec.need - spec.have);
			rec.setLineItemValue('item', 'rate', lensPos, 0);
			rec.setLineItemValue('item', 'amount', lensPos, 0);
			rec.setLineItemValue('item', 'location', lensPos, rec.getFieldValue('location'));
		}
	}
}


function splitOrder(rec){
	if(rec.getFieldValue('custbody_sale_type')) return false; // only split once.

	//short circuit handling -- mark type and do nothing else
//	if(537 == rec.getFieldValue('promocode'))
//	{
//		setOrderType(rec, SALE_TYPE_RETAIL);
//		nlapiSubmitRecord(rec);
//		return;
//
//		/*
//			rather than hardwire a promo code could use any promo code that links to a stable discount
//			&&
//				nlapiSearchRecord('promotioncode', null,
//					[new nlobjSearchFilter('internalid', null, 'is', rec.getFieldValue('promocode')),
//						new nlobjSearchFilter('discount', null, 'is', 539)])
//		*/
//	}
	var couldBeMixedUp = (function(){
			var orderLines = nlapiSearchRecord('salesorder', null,
			new nlobjSearchFilter('internalid', null, 'is', rec.getId()),
			new nlobjSearchColumn('parent', 'item'));
			if(!orderLines) return false;
			var hasGiftBox = false, hasHTO = false;
			var htoParent = nlapiGetContext().getSetting("SCRIPT", "custscript_hto_frame_parent");
			var giftBoxParent = nlapiGetContext().getSetting('SCRIPT', 'custscript_giftbox_frame_parent');
			orderLines.forEach(function(line){
				switch (line.getValue('parent', 'item')){
					case htoParent : hasHTO = true; return;
					case giftBoxParent : hasGiftBox = true; return;
				}
			});
			return (hasHTO && hasGiftBox);
	})();

	if(couldBeMixedUp){
		setOrderType(rec, SALE_TYPE_GIFT_BOX);
		rec.setFieldValue('custbody_auto_approve_reject_reason', 'received gift box order with self selected HTO items');
		return true;
	}

	var orderLines = {
		standard:[],
		hto:[],
		sunglasses:[],
		rxSunglasses:[],
		xoverSunglasses:[],
		lensreplacement:[],
		gift:[],
		giftBox:[],
		allBut:function(arr){
			return [].concat(
				arr === this.standard ? [] : this.standard,
				arr === this.hto ? [] : this.hto,
				arr === this.sunglasses ? [] : this.sunglasses,
				arr === this.rxSunglasses ? [] : this.rxSunglasses,
				arr === this.xoverSunglasses ? [] : this.xoverSunglasses,
				arr === this.lensreplacement ? [] : this.lensreplacement,
				arr === this.gift ? [] : this.gift,
				arr === this.giftBox ? [] : this.giftBox);
		}
	};

	var hasPromo = false, hasPreOrder = false;
	var ctx = nlapiGetContext();

	var stdParent = ctx.getSetting("SCRIPT", "custscript_standard_frame_parent") || '15';
	var noRxParent = ctx.getSetting("SCRIPT", "custscript_taxable_frame_parent");
	var htoParent = ctx.getSetting("SCRIPT", "custscript_hto_frame_parent") || '342';
	var giftBoxParent = ctx.getSetting("SCRIPT", "custscript_giftbox_frame_parent");
	var sunglassesParent = ctx.getSetting("SCRIPT", "custscript_sunglass_frame_parent");
	var sunglassesRXParent = ctx.getSetting("SCRIPT", "custscript_rx_sunglass_frame_parent");
	var xoverSGParent = ctx.getSetting('SCRIPT', 'custscript_crossover_norx_sg_parent');

	var itemDetail = (function(){
		var map = [];
		var itemIds = [];
		var itemCount = rec.getLineItemCount('item');
		for(var i = 1; i<= itemCount; i++){ itemIds.push(rec.getLineItemValue('item', 'item', i));}
		nlapiLogExecution("DEBUG", 'assembled order items. '+ itemIds.length +" items");

		if(itemIds.length){
			var items = nlapiSearchRecord('item', null,
				[
					new nlobjSearchFilter('internalid', null, 'anyof', itemIds)
				],[
					new nlobjSearchColumn('parent'),
					new nlobjSearchColumn('type'),
					new nlobjSearchColumn('custitem_is_promo'),
					new nlobjSearchColumn('custitem_is_gift_card_proxy')]);

			if(items) items.forEach(function(item){ map[item.getId()] = item;});
		}
		return map;
	})();

	var itemCount = rec.getLineItemCount('item');
	for(var i = 1; i<= itemCount; i++){
		if('T' == rec.getLineItemValue('item', 'custcol_is_pre_order', i)) hasPreOrder = true;
		var item = itemDetail[rec.getLineItemValue('item', 'item', i)];
		if(rec.getLineItemValue('item', 'custcol_replacment_target_frame', i)){
			orderLines.lensreplacement.push(i);
		}else if(item){
			switch(item.getValue('parent')){
				case noRxParent:
				case stdParent : orderLines.standard.push(i);break; // noRx frames and rx Frames are both standard
				case htoParent : orderLines.hto.push(i);break;
				case sunglassesParent : orderLines.sunglasses.push(i);break;
				case sunglassesRXParent : orderLines.rxSunglasses.push(i);break;
				case xoverSGParent : orderLines.xoverSunglasses.push(i); break;
				case giftBoxParent : orderLines.giftBox.push(i); break;
				default : break;
			}
			if('T' == item.getValue('custitem_is_promo')) hasPromo = true;
			if('T' == item.getValue('custitem_is_gift_card_proxy') || 'GiftCert' == item.getValue('type')) orderLines.gift.push(i);
		}
	}


	nlapiLogExecution("DEBUG", "counted order lines for "+ rec.getFieldValue('tranid'),
		"std: "+ orderLines.standard.length +"\nsg: "+ orderLines.sunglasses.length +"\ngift: "+ orderLines.gift.length +"\nhto: "+ orderLines.hto.length);

	function standardMain(){ setOrderType(rec, SALE_TYPE_STD, orderLines.allBut(orderLines.standard));}
	function rxSGMain(){ setOrderType(rec, SALE_TYPE_RX_SUNGLASSES, orderLines.allBut(orderLines.rxSunglasses), opticalSGSetup);}
	function xoverSGMain(){setOrderType(rec, SALE_TYPE_CROSSOVER_NON_RX, orderLines.allBut(orderLines.xoverSunglasses), opticalSGSetup);}
	function sgMain(){ setOrderType(rec, SALE_TYPE_SUNGLASSES, orderLines.allBut(orderLines.sunglasses));}
	function giftMain(){ setOrderType(rec, SALE_TYPE_GIFT, orderLines.allBut(orderLines.gift), giftCardSetup);}
	function giftBoxMain(){ setOrderType(rec, SALE_TYPE_GIFT_BOX);}
	function replaceLensMain(){ setOrderType(rec, SALE_TYPE_REPLACE_LENS, orderLines.allBut(orderLines.lensreplacement));}
	function htoMain(){ setOrderType(rec, SALE_TYPE_HTO, orderLines.allBut(orderLines.hto), htoSetup);}
	function unknownMain(){ setOrderType(rec, SALE_TYPE_UNKNOWN);}


	var mainOrder =
		orderLines.standard.length ? standardMain :
		orderLines.rxSunglasses.length ? rxSGMain :
		orderLines.sunglasses.length ? sgMain :
		orderLines.xoverSunglasses.length ? xoverSGMain :
		orderLines.gift.length ? giftMain :
		orderLines.giftBox.length ? giftBoxMain :
		orderLines.lensreplacement.length ? replaceLensMain :
		orderLines.hto.length ? htoMain : unknownMain;


	// split the order. Always keep most significant paid order as original. Important for prescriptions!
	(function runWhileOk(){ // run a sequence of functions only if each returns true;
		for(var i = 0; i< arguments.length; i++){
			if(!(arguments[i])()) return;
		}
	})(
	function(){ return (orderLines.gift.length && mainOrder !== giftMain) ? copyOrder(rec, SALE_TYPE_GIFT, orderLines.gift, giftCardSetup) : true;},
	function(){ return (orderLines.giftBox.length && mainOrder !== giftBoxMain) ? copyOrder(rec, SALE_TYPE_GIFT_BOX, orderLines.giftBox) : true;},
	function(){ return (orderLines.rxSunglasses.length && mainOrder !== rxSGMain) ? copyOrder(rec, SALE_TYPE_RX_SUNGLASSES, orderLines.rxSunglasses, opticalSGSetup) : true;},
	function(){ return (orderLines.sunglasses.length && mainOrder !== sgMain) ? copyOrder(rec, SALE_TYPE_SUNGLASSES, orderLines.sunglasses) : true;},
	function(){ return (orderLines.xoverSunglasses.length && mainOrder !== xoverSGMain) ? copyOrder(rec, SALE_TYPE_CROSSOVER_NON_RX, orderLines.xoverSunglasses, opticalSGSetup) : true;},
	function(){ return (orderLines.lensreplacement.length && mainOrder !== replaceLensMain) ? copyOrder(rec, SALE_TYPE_REPLACE_LENS, orderLines.lensreplacement) : true;},
	function(){ return (orderLines.hto.length && mainOrder !== htoMain)  ? copyOrder(rec, SALE_TYPE_HTO, orderLines.hto, htoSetup) :true;},
	mainOrder);

	return true; // assume sets the order type if nothing else.
}

	function adjustShippingMethod(rec){
		var STD_SHIP = '4',
			FIFTY_ONE_SHIP = '1411',
			UPS_2ND_DAY_AIR = '711';

		var needSave = false;

		var existFields = rec.getId() ? nlapiLookupField(rec.getRecordType(), rec.getId(), ['shipmethod', 'shipstate', 'shipcountry', 'custbody_sale_type', 'entity', 'location']) : {shipmethod:null, shipstate:null, entity:null};

		var shipState = rec.getFieldValue('shipstate') || existFields.shipstate;
		var origShipMethod = rec.getFieldValue('shipmethod') || existFields.shipmethod;
		var shipMethod = origShipMethod || STD_SHIP;

		if(shipMethod == FIFTY_ONE_SHIP){
			shipMethod = UPS_2ND_DAY_AIR;
			if(parseFloat(rec.getFieldValue('shippingcost'))){
				rec.setFieldValue('shippingcost', '0.00');
				rec.setFieldValue('altshippingcost', '0.00');
				needSave = true;
			}
		}else{

			var saleType = rec.getFieldValue('custbody_sale_type');
			var isMappedSale = saleType == SALE_TYPE_STD || saleType == SALE_TYPE_COMBO || saleType == SALE_TYPE_SUNGLASSES;

			nlapiLogExecution("DEBUG", "SaleType: "+ saleType +", mapped Sale: "+ isMappedSale + ", shipMethod: "+ shipMethod +" ship state: "+ shipState);

			if(shipMethod == STD_SHIP && isMappedSale) shipMethod = getShippingMethod(
					rec.getFieldValue('location') || existFields.location,
					shipState,
					rec.getFieldValue('shipcountry') || existFields.shipcountry);
		}

		if(shipMethod && shipMethod != origShipMethod){
			rec.setFieldValue('shipcarrier', 'nonups');
			rec.setFieldValue('shipmethod', shipMethod);
			needSave = true;
		}
		return needSave;
	}


//function giftCardSetup(rec){
//	var giftCardIds = eval(nlapiGetContext().getSetting('SCRIPT', 'custscript_gift_card_item_ids')); // format [{pseudo:pseudogiftid,gift:giftcardid},...]
//	for(var i = rec.getLineItemCount('item'); i> 0; i--){
//		var itemId = rec.getLineItemValue('item', 'item', i);
//		var giftId = (function(){ for(var j in giftCardIds) {if(itemId == giftCardIds[j].pseudo) return giftCardIds[j].gift;} return null;})();
//		if(giftId){
//			var giftMessage = rec.getLineItemValue('item', 'custcol_gift_card_message', i);
//			var giftTo = rec.getLineItemValue('item', 'custcol_gift_card_to', i);
//			var giftFrom = rec.getLineItemValue('item', 'custcol_gift_card_from', i);
//			rec.setLineItemValue('item', 'item', i, giftId);
//			rec.setLineItemValue('item', 'giftcertmessage', i, giftMessage);
//			rec.setLineItemValue('item', 'giftcertrecipientname', i, giftTo);
//			rec.setLineItemValue('item', 'giftcertfrom', i, giftFrom);
//			rec.setLineItemValue('item', 'giftcertrecipientemail', i, nlapiGetContext().getSetting('SCRIPT', 'custscript_gift_card_default_email'));
//			rec.setLineItemValue('item', 'location', i, rec.getFieldValue('location'));
//		}
//	}
//}

	var rec = null;
	try{
		// actual meat of the function
		rec = nlapiLoadRecord(recType, recId);
		var needsSave = false;
		if(isMagento(rec)){
			nlapiLogExecution("AUDIT", "checking magento order rx: "+ rec.getFieldValue('tranid'), "Sales type: "+ rec.getFieldValue('custbody_sale_type'));
			if(!rec.getFieldValue('custbody_sale_type')) {
				var magQuery = new MagentoSOAP('bk-ws', 'knightsofthenet');
				try{
					var rxRec = magQuery.getOrderRx(rec.getFieldValue('entity'), rec.getFieldValue('custbody_celigo_magento_id'));
					if(rxRec){
						var rxId = nlapiSubmitRecord(rxRec, {disabletriggers:true, enablesourcing:true, ignoremandatoryfields:true});
						if(rxId){
							rec.setFieldValue('custbody_prescription', rxId);
							needsSave = true;
						}
					}
				}catch(e){
					nlapiLogExecution('ERROR', e.message || e.toString(), e.getStackTrace ? e.getStackTrace().join("\n") : null);
				}
				try{
					var hasGiftItems = (function(){
						var itemIds = [];
						var itemCount = rec.getLineItemCount('item');
						for(var i = 1; i<= itemCount; i++){ itemIds.push(rec.getLineItemValue('item', 'item', i));}

						if(!itemIds.length) return false;
						var giftBoxParent = nlapiGetContext().getSetting('SCRIPT', 'custscript_giftbox_frame_parent');
						var items = nlapiSearchRecord('item', null,
							[
								new nlobjSearchFilter('internalid', null, 'anyof', itemIds)
							],[
								new nlobjSearchColumn('type'),
								new nlobjSearchColumn('custitem_is_gift_card_proxy'),
								new nlobjSearchColumn('parent')]);

						if(items) return items.some(function(item){
							return (
								'T' == item.getValue('custitem_is_gift_card_proxy') ||
								'GiftCert' == item.getValue('type') ||
								giftBoxParent == item.getValue('parent') );
						});

						return false;
					})();

					function processCGOrder(orderNode){
						function getGCLine(magLineId){
							for(var i = 1; i<= rec.getLineItemCount('item'); i++){
								if(magLineId == rec.getLineItemValue('item', 'custcol_celigo_magento_id', i)) return i;
							}
							return 0;
						}

						if(hasGiftItems){
							var GCItems = nlapiSelectNodes(orderNode, "//item[key='items']/value/item[item[key='product_type'][value='giftcard']]");
							if(GCItems && GCItems.length){
								GCItems.forEach(function(gcItemNode){
									var magentoLineId = getGCLine(nlapiSelectValue(gcItemNode, "item[key='item_id']/value"));
									var lineOpts = magQuery.parseOptionsStruct(nlapiSelectValue(gcItemNode, "item[key='product_options']/value"));
									if(lineOpts){
										nlapiLogExecution('DEBUG', 'set GC sender to: '+ lineOpts.giftcard_sender_name +' at line '+ magentoLineId);
										rec.setLineItemValue('item', 'custcol_gift_card_from', magentoLineId, lineOpts.giftcard_sender_name);
										rec.setLineItemValue('item', 'custcol_gift_card_to', magentoLineId, lineOpts.giftcard_recipient_name);
										rec.setLineItemValue('item', 'custcol_gift_card_message', magentoLineId, lineOpts.giftcard_message);
										needsSave = true;
									}
								});
							}
						}

						// has gift certs to apply:
						var GCApplied = nlapiSelectValue(orderNode, "item[key='gift_cards']/value");
						if(GCApplied){
							var gcSpecs = magQuery.parseOptionsStruct(GCApplied);
							if(gcSpecs) {
								if(rec.getLineItemCount('giftcertredemption') === 0){ // only apply if nothing yet
									var redemptionLine = 0;
									gcSpecs.forEach(function(spec){
										var foundGC = nlapiSearchRecord('giftcertificate',null, new nlobjSearchFilter('giftcertcode', null, 'is', spec.c),
											[
												new nlobjSearchColumn('amountremaining'),
												new nlobjSearchColumn('gcactive'),
												new nlobjSearchColumn('amtavailbilled'),
												new nlobjSearchColumn('originalamount')
											]);
										if(foundGC && 'T' == foundGC[0].getValue('gcactive')){
											redemptionLine++;
											rec.insertLineItem('giftcertredemption', redemptionLine);
											rec.setLineItemValue('giftcertredemption', 'authcode', redemptionLine, foundGC[0].getId());
											needsSave = true;
										}else{
											var failMsg = 'gift code: '+ spec.c +(foundGC ? ' not active ' : ' not found ')+ 'for order: '+ rec.getFieldValue('tranid');
											nlapiLogExecution('ERROR', failMsg);
											try{
												nlapiSendEmail(-5, 'lee@warbyparker.com', 'Could not find gift code: '+ spec.c, failMsg, 'brett@knightsofthenet.com', null, {transaction:rec.getId()});
											}catch(e){
												nlapiLogExecution("ERROR", e.message || e.toString());
											}
										}
									});
								}
							}
						}
					}

					magQuery.getOrderDetail(rec.getFieldValue('custbody_celigo_magento_id'), processCGOrder);


				}catch(e){
					nlapiLogExecution('ERROR', e.message || e.toString(), e.getStackTrace ? e.getStackTrace().join("\n") : null);
				}
			}
		} else{
		(function(rxId){
				if(rxId && !rec.getFieldValue('custbody_prescription')) {
					// check does this rx belong to this customer or is it from a cached browser session
					var rxOwner = nlapiLookupField('customrecord_prescription', rxId, 'custrecord_prescrip_customer');
					if(rxOwner && rxOwner == rec.getFieldValue('entity')){
						needsSave = true;
						rec.setFieldValue('custbody_prescription', rxId);
					}
				}
			})(rec.getFieldValue('custbody_store_rxid'));
		}

		ng(getPriorHTO(rec.getFieldValue('entity'), rec.getFieldValue('trandate')), function(val){
			needsSave = true;
			rec.setFieldValue('custbody_prior_hto', val);
		});

		ng(getSalesChannel(rec.getFieldValue('promocode'), rec.getFieldValue('custbody_prior_hto'), rec.getFieldValue('custbody_sales_channel'), rec.getFieldValue('source')), function(val){
			needsSave = true;
			rec.setFieldValue('custbody_sales_channel', val);
		});


		if(needsSave){
			var lastMod = rec.getFieldValue('lastmodifieddate');
			var lastModTS = lastMod ? nlapiStringToDate(lastMod, 'datetime').getTime() : new Date().getTime();
			var maxCheck = 3;
			nlapiSubmitRecord(rec, { disabletriggers:true, enablesourcing:true});
			do{
				rec = nlapiLoadRecord(rec.getRecordType(), rec.getId()); //if TS not changed then hoping nlapiLoadRecord is a poor mans delay; want the record to finish updating before moving on.
				var newLastMod = rec.getFieldValue('lastmodifieddate');
				if(newLastMod){
					var newLastModTS = nlapiStringToDate(newLastMod, 'datetime').getTime();
					if(newLastModTS > lastModTS) break; // we have an update.
					nlapiLogExecution("DEBUG", "loaded record without changed TS "+ maxCheck);
				}
				maxCheck--;
			}while(maxCheck);

			needsSave = false;
		}
		needsSave = splitOrder(rec);
		needsSave = adjustShippingMethod(rec) || needsSave;

		if(needsSave) nlapiSubmitRecord(rec, true, true);
	}catch(e){

		var n = nlapiCreateRecord('note');
		n.setFieldValue('title','Error Splitting Order');
		n.setFieldValue('transaction', rec.getId());
		n.setFieldValue('note', e.message|| e.toString() + (e.getStackTrace ? '\n\n'+ e.getStackTrace().join("\n") : ''));
		nlapiSubmitRecord(n);

		nlapiSubmitField(rec.getRecordType(), rec.getId(), 'custbody_sale_type', SALE_TYPE_UNKNOWN, {disabletriggers:true, enablesourcing:false});
	}
}

function testOrganizeOrder(request, response){
	organizeOrder('salesorder', request.getParameter('custpage_orderid'));
	response.setContentType("PLAINTEXT");
	response.write("done");
}

function getPriorHTO(customerId, trandate){
	//this function used as library function in at least orderManagement.js
	var SALE_TYPE_HTO = '1';

	var cutoff = nlapiDateToString(new Date(nlapiStringToDate(trandate).getTime() - (47 * 24 * 3600000)));
	var priorHTOs = nlapiSearchRecord('salesorder', null, [
		new nlobjSearchFilter('custbody_sale_type', null, 'is', SALE_TYPE_HTO),
		new nlobjSearchFilter('mainline', null, 'is', 'T'),
		new nlobjSearchFilter('entity', null, 'is', customerId),
		new nlobjSearchFilter('actualshipdate', null, 'onorafter', cutoff),
		new nlobjSearchFilter('actualshipdate', null, 'onorbefore', trandate)],
		new nlobjSearchColumn('trandate').setSort(true));
	if(priorHTOs){
		return priorHTOs[0].getId();
	}
	return null;
}

function ng(val, f, dflt){ // guard against setting a field with a blank value ng== NullGuard
	if(val !== null && typeof val !== "undefined" && val !== ""){
		if(val.constructor != Array) return f(val);
		if(val.length)return f(val);
	}
	if(typeof dflt == 'function') return dflt();
	return typeof dflt == 'undefined' ? null : dflt;
}

function getSalesChannel(promoCodeId, priorHTO, currentSalesChannel, source, refresh){
	//this function used as library function in at least orderManagement.js
	if(currentSalesChannel && !refresh) return null;

	if(promoCodeId){
		var channel = nlapiLookupField('promotioncode', promoCodeId, 'custrecord_sales_channel');
		if(channel) return channel;
	}

	if(priorHTO) return '3'; // HTO channel id

	if(!source) return '5'; // other

	return '4'; // Web Channel
}

function massUpdatePriorHTO(recType, recId){
	var recInfo = nlapiLookupField(recType, recId, ['entity', 'custbody_sale_type', 'trandate', 'custbody_prior_hto']);
	var priorHTO = getPriorHTO(recInfo.entity, recInfo.trandate);
	var updateIt = (priorHTO && priorHTO != recInfo.custbody_prior_hto) || (!priorHTO && recInfo.custbody_prior_hto); // update if has one now and not what it was or used to have one and doesn't now
	if(updateIt) nlapiSubmitField(recType, recId, 'custbody_prior_hto', priorHTO || null);
}

function massUpdateSalesChannel(recType, recId){
	var rec = nlapiLoadRecord(recType, recId);
	var needsSave = false;
	ng(getSalesChannel(rec.getFieldValue('promocode'), rec.getFieldValue('custbody_prior_hto'), rec.getFieldValue('custbody_sales_channel'), rec.getFieldValue('source'), true), function(val){
		needsSave = true;
		nlapiLogExecution('DEBUG', "received sales channel for "+ rec.getFieldValue('tranid'), val);
		rec.setFieldValue('custbody_sales_channel', val);
	});
	if(needsSave) nlapiSubmitRecord(rec);
	else{
		nlapiLogExecution('DEBUG', "no sales channel for "+ rec.getFieldValue('tranid'),
		'promocode' +': '+ rec.getFieldValue('promocode') +' '+
			'custbody_prior_hto'+': '+ rec.getFieldValue('custbody_prior_hto') +' '+
			'custbody_sales_channel'+': '+ rec.getFieldValue('custbody_sales_channel') +' '+
			'source'+': '+ rec.getFieldValue('source') +' '+
			'custbody_sale_type'+': '+ rec.getFieldValue('custbody_sale_type'));
	}
}



function organizeNewOrders(){
	batchProcess(
		function(){ return {lastId:(parseInt(nlapiGetContext().getSetting('SCRIPT', 'custscript_last_new_order_id'),10) || 0)};},
		function(ctx){
			var filters = ctx.lastId ? new nlobjSearchFilter('internalidnumber', null, 'greaterthan', ctx.lastId) : null;
			return nlapiSearchRecord('salesorder', 'customsearch_new_orders_to_process', filters);
		},
		function(ctx){
			ctx.lastId = this.getId();
			try{
				organizeOrder(this.getRecordType(), this.getId());

				var recFields = nlapiLookupField(this.getRecordType(), this.getId(), ['source', 'entity', 'email','custbody_sale_type', 'custbody_sales_channel']);

				// set last std order placed date.
				(function(){
					var custUpdateCols = [], custUpdateValues = [];
					if(/[24]/.test(recFields.custbody_sale_type)){ //Standard Sale or Standard plus HTO
						custUpdateCols.push('custentity_last_std_order_placed'); custUpdateValues.push(nlapiDateToString(new Date()));
					}
					if(recFields.custbody_sales_channel && !nlapiLookupField('customer', recFields.entity, 'custentity_sales_channel')){
						custUpdateCols.push('custentity_sales_channel'); custUpdateValues.push(recFields.custbody_sales_channel);
					}
					if(custUpdateCols.length){
						nlapiSubmitField('customer', recFields.entity, custUpdateCols, custUpdateValues, {disabletriggers:true, enablesourcing:true});
					}

			})();

				if(recFields.source == 'NLWebStore'){
					var anyMessage = nlapiSearchRecord('salesorder', null, [
							new nlobjSearchFilter('internalid', null, 'is', this.getId()),
							new nlobjSearchFilter('mainline', null, 'is', 'T'),
							new nlobjSearchFilter('subject', 'messages', 'isnotempty')],
							new nlobjSearchColumn('subject', 'messages'));

					if(!anyMessage) sendOrderMessage( //allow cleanup on orders already sent
						null,
						nlapiGetContext().getSetting("SCRIPT", 'custscript_std_order_received_template'),
						this.getRecordType(),
						this.getId(),
						recFields.entity,
						stdOrderItemFormatter,
						function getRecip(){ return recFields.email;});
				}
			}catch(e){
				nlapiLogExecution('ERROR', "Error processing order: "+ this.getId(), (e.message || e.toString()) +(e.getStackTrace ? "\n\n"+ e.getStackTrace().join("\n") : ''));
			}
		},
		function(ctx){
			return { custscript_last_new_order_id: ctx.lastId};
		});

}


function getShippingMethod(shipLocation, shipState, shipCountry){
	nlapiLogExecution('DEBUG', "getting ship location for: location: "+ shipLocation + " state: "+ shipState + " country: "+ shipCountry);
	var locParent = null;
	do{
		var locnRec = nlapiLoadRecord('location', shipLocation);
		locParent = locnRec.getFieldValue('parent');
		if(locParent) shipLocation = locParent;
	}while(locParent);

	var shipMethods = nlapiSearchRecord('customrecord_lab_ship_methods', null,  // pull everything to ensure we get domestic and international defaults
	[
		new nlobjSearchFilter('custrecord_lab_location', null, 'is', shipLocation),
		new nlobjSearchFilter('isinactive', null, 'is', 'F')
	],
	[
		new nlobjSearchColumn('custrecord_lab_ship_country'),
		new nlobjSearchColumn('custrecord_lab_ship_state'),
		new nlobjSearchColumn('custrecord_lab_ship_method'),
		new nlobjSearchColumn('custrecord_lab_is_dflt_domestic_method')
	]);

	if(!shipMethods) return null;
	var countryMethods = [];
	var stateMethods = [];

	shipMethods.forEach(function(ref){
		if(shipCountry && shipCountry != ref.getValue('custrecord_lab_ship_country')) return; // must at least match country

		if(!ref.getValue('custrecord_lab_ship_state')){
			countryMethods.push(ref);
			return;
		}

		if(shipState && shipState != ref.getValue('custrecord_lab_ship_state')) return;
		stateMethods.push(ref);

	});

	var shipRef =  stateMethods.length ? stateMethods[0] : countryMethods.length ? countryMethods[0] : null;
	if(!shipRef) return null;
	return shipRef.getValue('custrecord_lab_ship_method');
}
