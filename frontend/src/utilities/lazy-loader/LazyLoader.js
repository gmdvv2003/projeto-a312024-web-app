import { v4 as uuidv4 } from "uuid";

import React, { useEffect, useState, useImperativeHandle, useRef } from "react";

const LazyLoader = React.forwardRef(
	(
		{
			topLeftOffset,
			bottomRightOffset,
			container,
			scrollBar,
			constructElement,
			width,
			height,
			margin,
			padding,
			direction,
			fetchMore,
			getAvailableContentCountForFetch,
			getContent,
			pageSize,
		},
		ref
	) => {
		// Conteúdo a ser exibido na tela
		const [visibleContent, setVisibleContent] = useState([]);

		// Referências das intancias dos elementos que estão sendo exibidos na tela
		const visibleContentDataRefs = useRef([]);

		const associatedPlaceholdersRefs = useRef({});

		const [topOffset, setTopOffset] = useState(0);
		const [bottomOffset, setBottomOffset] = useState(0);

		const placeholdersContent = useRef([]);

		useImperativeHandle(
			ref,
			() => ({
				/**
				 *
				 * @param {*} component
				 * @returns
				 */
				getComponentDataFromRef: (component) => {
					console.log("===================================== FIND");
					return (
						visibleContentDataRefs.current.find(({ current }) => {
							console.log("Current:", current);
							console.log("Component:", component);
							console.log("\n");
							return current == component;
						}) || {}
					);
				},

				/**
				 *
				 * @param {*} ref
				 * @returns
				 */
				getAssociatedPlaceholder: (ref) => {
					return associatedPlaceholdersRefs.current[ref];
				},

				/**
				 *
				 * @param {*} ref
				 * @param {*} uuid
				 */
				associatePlaceholder: (ref, uuid) => {
					placeholdersContent.current.forEach((element) => {
						if (element.uuid == uuid) {
							associatedPlaceholdersRefs.current[ref] = element;
						}
					});
				},

				/**
				 *
				 * @param {*} uuid
				 */
				removePlaceholderAssociation: (uuid) => {},

				/**
				 *
				 * @param {*} element
				 * @param {*} index
				 * @returns
				 */
				addPlaceholder: (element, index) => {
					const uuid = uuidv4();

					const order = (placeholdersContent.current[index]?.order || 0) + 1;
					placeholdersContent.current.splice(index, 0, { placeholder: true, element, order, uuid });

					return uuid;
				},

				/**
				 *
				 * @param {*} uuid
				 */
				removePlaceholder: (uuid) => {
					placeholdersContent.current.filter((element) => element.uuid == uuid);
				},
			}),
			[]
		);

		useEffect(() => {
			const containerCopy = container.current;
			const scrollBarCopy = scrollBar.current;

			let sectionFetchTimeoutId;

			let currentSectionStart = 0;
			let currentSectionEnd = pageSize;

			let lastSectionStart = 0;
			let lastSectionEnd = 0;

			let lastItemIndex = 0;

			/**
			 * Retorna o conteúdo a ser exibido na tela
			 * (Realiza o fetch de mais conteúdo caso necessário)
			 *
			 * @param {number} start
			 * @param {number} end
			 * @returns {Array}
			 */
			async function retrieveVisibleContent(start, end, lateFetch) {
				// Caso não tenha conteúdo, preenche a lista com conteúdo vazio
				if (getContent.length < end) {
					for (let index = getContent.length; index < end; index += 1) {
						getContent.push(undefined);
					}
				}

				// Pega a "fatia" do conteúdo que está sendo exibido no momento e verifica se há algum elemento indefinido
				const undefinedContentIndex = getContent.slice(start, end).findIndex((element) => element === undefined);

				if (undefinedContentIndex > -1) {
					if (currentSectionEnd !== lastSectionEnd || currentSectionStart !== lastSectionStart) {
						// Cancela o timeout anterior
						if (sectionFetchTimeoutId) {
							clearTimeout(sectionFetchTimeoutId);
						}

						// Inicia um novo timeout
						sectionFetchTimeoutId = setTimeout(async () => {
							const fetchedContent = await fetchMore(Math.floor((start + undefinedContentIndex) / pageSize));
							fetchedContent.forEach((element, index) => {
								const contentIndex = start + undefinedContentIndex + index;
								getContent[contentIndex] = getContent[contentIndex] || element;
							});

							// Atualiza o conteúdo a ser exibido na tela
							lateFetch(getContent.slice(start, end));
						}, 1000);
					}
				}

				// Retorna novamente a "fatia" do conteúdo que está sendo exibido no momento
				return getContent.slice(start, end);
			}

			/**
			 *
			 */
			function getTopLeftOffset() {
				switch (direction) {
					case "horizontal":
						return currentSectionStart * (width + padding) + margin;

					case "vertical":
						return 0;

					default:
						break;
				}
			}

			/**
			 *
			 */
			function getBottomRightOffset() {
				switch (direction) {
					case "horizontal":
						return getAvailableContentCountForFetch() * (width + padding) + margin - getTopLeftOffset();

					case "vertical":
						return 0;

					default:
						break;
				}
			}

			/**
			 * Retorna o número máximo de elementos que podem ser exibidos na tela
			 *
			 * @returns {number}
			 */
			function getMaxPossibleElementsInContainer() {
				switch (direction) {
					case "horizontal":
						return Math.ceil(scrollBarCopy.clientWidth / width);

					case "vertical":
						return 0;

					default:
						return 0;
				}
			}

			/**
			 * Retorna os limites da seção atual
			 *
			 * @returns {number}
			 */
			function getSectionThreshold() {
				return Math.floor(getMaxPossibleElementsInContainer() * 2);
			}

			/**
			 * Retorna o índice do item que está sendo exibido no momento
			 *
			 * @returns {number}
			 */
			function getCurrentItemIndex() {
				switch (direction) {
					case "horizontal":
						return Math.max(0, Math.floor((scrollBarCopy.scrollLeft - margin) / (width + padding)));

					case "vertical":
						return 0;

					default:
						return 0;
				}
			}

			/**
			 * Retorna os limites da seção atual
			 *
			 * @param {number} offset
			 * @returns {[number, number]}
			 */
			function getSectionBounds(offset) {
				const maxPossibleElementsInContainer = getMaxPossibleElementsInContainer();

				// Retorna o multiplo mais próximo para baixo e para cima do offset
				const start = offset - (offset % maxPossibleElementsInContainer);
				const end = offset + maxPossibleElementsInContainer - (offset % maxPossibleElementsInContainer);

				return [start, end];
			}

			/**
			 * Função responsável por carregar o conteúdo a ser exibido na tela
			 */
			async function setDisplayableContent() {
				let update = (visibleContent) => {
					setVisibleContent(visibleContent);
				};

				update(await retrieveVisibleContent(currentSectionStart, currentSectionEnd, update));
			}

			/**
			 * Função responsável por lidar com o evento de scroll
			 */
			async function handleScroll() {
				// Atualiza o item que está sendo exibido no momento
				let currentItemIndex = getCurrentItemIndex();

				// Margem superior e inferior da seção
				const sectionThreshold = getSectionThreshold();

				// Pega os limites da seção atual e expande a seção para cima e para baixo se necessário
				const [sectionStart, sectionEnd] = getSectionBounds(currentItemIndex);
				if (currentItemIndex - sectionStart <= sectionThreshold) {
					currentSectionStart = Math.max(0, sectionStart - getMaxPossibleElementsInContainer());
				}

				if (sectionEnd - currentItemIndex <= sectionThreshold) {
					currentSectionEnd = sectionEnd + getMaxPossibleElementsInContainer();
				}

				// Caso a seção atual seja diferente da seção anterior, atualiza o conteúdo a ser exibido na tela
				if (currentItemIndex !== lastItemIndex) {
					setDisplayableContent();
				}

				topLeftOffset.current.style.width = getTopLeftOffset() + "px";
				bottomRightOffset.current.style.width = getBottomRightOffset() + "px";

				lastSectionStart = currentSectionStart;
				lastSectionEnd = currentSectionEnd;

				// "Salva" o index do ultimo item que foi exibido
				lastItemIndex = currentItemIndex;
			}

			const initialItemIndex = getCurrentItemIndex();
			if (initialItemIndex === 0) {
				setDisplayableContent();
			}

			scrollBarCopy.addEventListener("scroll", handleScroll, { passive: true });

			return () => {
				scrollBarCopy.removeEventListener("scroll", handleScroll);
			};
		}, [container, scrollBar]);

		return visibleContent.map((data, index) => {
			// Função para setar a referência do elemento
			const setReference = (element = {}) => {
				if (element === null) {
					return null;
				}

				const { ref } = element;
				visibleContentDataRefs.current[index] = { current: ref.current, data, index };
			};

			if (data === undefined) {
				return constructElement(null, index, true, setReference);
			} else {
				return constructElement(data, index, false, setReference);
			}
		});
	}
);

export default LazyLoader;
